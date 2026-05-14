import httpx
import asyncio
import io
import zipfile
import base64
from fastapi import HTTPException, status
from supabase import Client
from typing import List, Dict

from app.services.teams.github_service import _get_installation_token, _parse_github_owner_repo
from app.services.teams.team_service import require_member

GITHUB_API = "https://api.github.com"
C_CPP_EXTENSIONS = ('.c', '.cpp', '.h', '.hpp', '.cc', '.cxx', '.hxx')

async def _get_token_for_team(team_id: str, supabase: Client) -> str:
    """Helper to get a fresh installation token for a team."""
    team_result = supabase.table("teams").select("github_installation_id").eq("id", team_id).single().execute()
    installation_id = team_result.data.get("github_installation_id") if team_result.data else None

    if not installation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub App is not installed for this team. Connect GitHub first.",
        )
    return await _get_installation_token(installation_id)

async def fetch_branch_files(team_id: str, branch_name: str, user_id: str, supabase: Client) -> List[str]:
    """
    Fetches the Git tree for a branch and filters it to return only C/C++ files.
    """
    require_member(team_id, user_id, supabase)
    
    team_result = supabase.table("teams").select("github_repo").eq("id", team_id).single().execute()
    repo_url = team_result.data.get("github_repo")
    if not repo_url:
        raise HTTPException(status_code=400, detail="Team has no connected GitHub repository.")

    owner, repo = _parse_github_owner_repo(repo_url)
    token = await _get_token_for_team(team_id, supabase)

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Get the tree for the branch
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{branch_name}?recursive=1",
            headers=headers
        )
        
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to fetch branch tree: {resp.status_code}"
            )
            
        tree_data = resp.json()
        if "tree" not in tree_data:
            return []

        # Filter for C/C++ files
        c_cpp_files = [
            item["path"] for item in tree_data["tree"]
            if item["type"] == "blob" and item["path"].lower().endswith(C_CPP_EXTENSIONS)
        ]
        
        return c_cpp_files

async def _fetch_blob_content(client: httpx.AsyncClient, owner: str, repo: str, file_path: str, headers: dict) -> tuple[str, str]:
    """Fetches a single file's content via the GitHub Contents API."""
    resp = await client.get(
        f"{GITHUB_API}/repos/{owner}/{repo}/contents/{file_path}",
        headers=headers
    )
    if resp.status_code == 200:
        data = resp.json()
        if data.get("encoding") == "base64" and "content" in data:
            content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
            return file_path, content
    return file_path, ""

async def fetch_selected_code_hybrid(team_id: str, branch_name: str, selected_files: List[str], user_id: str, supabase: Client) -> Dict[str, str]:
    """
    Smartly fetches the content of the selected files.
    If < 50 files, uses concurrent API requests (Blob API).
    If >= 50 files, downloads the zipball and extracts only what's needed in memory.
    """
    require_member(team_id, user_id, supabase)

    if not selected_files:
        return {}

    team_result = supabase.table("teams").select("github_repo").eq("id", team_id).single().execute()
    repo_url = team_result.data.get("github_repo")
    if not repo_url:
        raise HTTPException(status_code=400, detail="Team has no connected GitHub repository.")

    owner, repo = _parse_github_owner_repo(repo_url)
    token = await _get_token_for_team(team_id, supabase)

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    files_content: Dict[str, str] = {}

    if len(selected_files) < 50:
        # ---------------------------------------------------------
        # BLOB APPROACH: Concurrent HTTP requests for small batches
        # ---------------------------------------------------------
        async with httpx.AsyncClient(timeout=30.0) as client:
            tasks = [
                _fetch_blob_content(client, owner, repo, path, headers)
                for path in selected_files
            ]
            results = await asyncio.gather(*tasks)
            for file_path, content in results:
                if content:
                    files_content[file_path] = content
    else:
        # ---------------------------------------------------------
        # ZIPBALL APPROACH: Download zip into memory, extract targeted files
        # ---------------------------------------------------------
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.get(
                f"{GITHUB_API}/repos/{owner}/{repo}/zipball/{branch_name}",
                headers=headers
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to download repository zip: {resp.status_code}"
                )
            
            # Read ZIP into memory buffer
            zip_buffer = io.BytesIO(resp.content)
            
            with zipfile.ZipFile(zip_buffer, "r") as zip_ref:
                # GitHub zips put everything inside a root directory with a dynamic name (owner-repo-sha)
                # We need to strip that first directory component to match our selected_files paths.
                for zip_info in zip_ref.infolist():
                    if zip_info.is_dir():
                        continue
                    
                    # Split path and remove the root folder
                    parts = zip_info.filename.split("/", 1)
                    if len(parts) < 2:
                        continue
                    
                    actual_path = parts[1]
                    if actual_path in selected_files:
                        with zip_ref.open(zip_info) as f:
                            files_content[actual_path] = f.read().decode("utf-8", errors="replace")

    return files_content

def dummy_vulnerability_scanner(files_dict: Dict[str, str]) -> dict:
    """
    Placeholder for the ML vulnerability scanner.
    Analyzes the dictionary of code files.
    """
    total_lines = 0
    for path, content in files_dict.items():
        total_lines += len(content.splitlines())

    return {
        "status": "success",
        "message": "Files successfully scanned by dummy model (In-Memory). Ready for ML integration.",
        "files_analyzed": len(files_dict),
        "total_lines_analyzed": total_lines
    }
