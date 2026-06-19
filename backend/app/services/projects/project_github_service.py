"""
project_github_service.py
--------------------------
GitHub repository operations for **personal** projects.

Connection flow: mirrors the GitHub App OAuth flow used by teams.
  1. generate_github_authorize_url → redirects user to GitHub App install
  2. process_github_callback → stores installation_id on the project
  3. fetch_installation_repos → lists repos accessible via installation token
  4. select_installation_repo → stores github_repo + github_branches
  5. sync_branches → re-syncs branches using stored installation token (no PAT)

File browsing / scanning still uses PAT-per-request (user supplies PAT at
scan time), because file content access is a read-only operation that doesn't
require a permanent installation.

Response types BranchFileItem, BranchFilesResponse, and FileContentResponse
are re-used directly from app.models.teams (same shape, no duplication).
"""

import asyncio
import base64
import io
import secrets
import zipfile
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from fastapi.responses import RedirectResponse
from supabase import Client
from typing import Dict, List

from app.config import settings
from app.models.projects import ProjectResponse
from app.models.teams import BranchFileItem, BranchFilesResponse, FileContentResponse, GithubAuthorizeResponse
from app.services.projects.project_service import require_owner
from app.services.teams.github_service import (
    _make_github_app_jwt,
    _get_installation_token,
    GITHUB_APP_SLUG,
)

GITHUB_API = "https://api.github.com"
C_CPP_EXTENSIONS = (".c", ".cpp", ".h", ".hpp", ".cc", ".cxx", ".hxx")

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _frontend_project_base_url() -> str:
    return f"{settings.frontend_base_url.rstrip('/')}/projects"

def _pat_headers(pat: str) -> dict:
    """Build standard GitHub API headers for a PAT request."""
    return {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _parse_github_owner_repo(repo_url: str) -> tuple[str, str]:
    """
    Parse a GitHub URL into (owner, repo).
    Accepts https://github.com/owner/repo or https://github.com/owner/repo.git
    """
    clean = repo_url.rstrip("/").removesuffix(".git")
    parts = clean.split("github.com/")
    if len(parts) != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GitHub URL. Expected format: https://github.com/owner/repo",
        )
    segments = parts[1].split("/")
    if len(segments) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GitHub URL. Expected format: https://github.com/owner/repo",
        )
    return segments[0], segments[1]


async def _validate_repo_and_fetch_branches(
    owner: str, repo: str, pat: str
) -> list[str]:
    """
    Validates the PAT and repo URL against the GitHub API, then paginates
    through all branches (100 per page).

    Raises 401/403/404/502 on GitHub API errors.
    """
    headers = _pat_headers(pat)

    async with httpx.AsyncClient(timeout=10.0) as client:
        repo_resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}",
            headers=headers,
        )

        if repo_resp.status_code == 401:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Personal Access Token.",
            )
        if repo_resp.status_code == 403:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Check that your PAT has the 'repo' scope.",
            )
        if repo_resp.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repository not found or not accessible with this PAT.",
            )
        if repo_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"GitHub API error: {repo_resp.status_code}",
            )

        # Paginate branches (100 per page)
        branches: list[str] = []
        page = 1
        while True:
            branch_resp = await client.get(
                f"{GITHUB_API}/repos/{owner}/{repo}/branches",
                headers=headers,
                params={"per_page": 100, "page": page},
            )
            if branch_resp.status_code != 200:
                break
            batch = branch_resp.json()
            if not batch:
                break
            branches.extend(b["name"] for b in batch)
            if len(batch) < 100:
                break
            page += 1

    return branches


def _get_project_github_repo(project_id: str, supabase: Client) -> str:
    """
    Reads the stored github_repo URL for a project.
    Raises 400 if none is connected.
    """
    result = (
        supabase.table("projects")
        .select("github_repo")
        .eq("id", project_id)
        .single()
        .execute()
    )
    if not result.data or not result.data.get("github_repo"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No GitHub repository connected to this project. Connect one first.",
        )
    return result.data["github_repo"]


async def _fetch_blob_content_pat(
    client: httpx.AsyncClient,
    owner: str,
    repo: str,
    file_path: str,
    branch: str,
    headers: dict,
) -> tuple[str, str]:
    """Fetches a single file's content via the GitHub Contents API."""
    resp = await client.get(
        f"{GITHUB_API}/repos/{owner}/{repo}/contents/{file_path}",
        headers=headers,
        params={"ref": branch},
    )
    if resp.status_code == 200:
        data = resp.json()
        if data.get("encoding") == "base64" and "content" in data:
            raw = data["content"].replace("\n", "")
            content = base64.b64decode(raw).decode("utf-8", errors="replace")
            return file_path, content
    return file_path, ""


# ---------------------------------------------------------------------------
# OAuth / GitHub App flow  (mirrors teams github_service)
# ---------------------------------------------------------------------------

def generate_github_authorize_url(
    project_id: str, user_id: str, supabase: Client
) -> GithubAuthorizeResponse:
    """
    Step 1 of the OAuth flow.
    Generates a GitHub App installation URL scoped to this project.
    Stores a CSRF token on the project row so the callback can verify it.
    """
    if not settings.github_app_id or not settings.github_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub App is not configured on this server",
        )

    require_owner(project_id, user_id, supabase)

    csrf_token = secrets.token_urlsafe(32)
    # state encodes "project:{project_id}:{csrf}" so the callback can route
    # back here instead of to the teams flow
    state = f"project:{project_id}:{csrf_token}"

    # Reuse the teams table's oauth_token column pattern — store pending CSRF
    # on the project row (projects table has a github_oauth_token column if
    # you added it, otherwise we use a temporary approach via the CSRF check).
    supabase.table("projects").update({
        "github_oauth_token": f"pending:{csrf_token}",
    }).eq("id", project_id).execute()

    authorization_url = (
        f"https://github.com/apps/{GITHUB_APP_SLUG}/installations/new"
        f"?state={state}"
    )
    return GithubAuthorizeResponse(authorization_url=authorization_url)


async def process_github_callback(
    installation_id: int | None,
    state: str | None,
    supabase: Client,
    code: str | None = None,
) -> RedirectResponse:
    """
    Step 2 of the OAuth flow — GitHub redirects here after the user installs
    the GitHub App. Validates the CSRF token, stores the installation_id on
    the project, then redirects to the project detail page.
    """
    frontend_project_base_url = _frontend_project_base_url()

    if not state:
        return RedirectResponse(f"{frontend_project_base_url}?github_error=missing_params")

    if state == "personal-github-import":
        resolved_installation_id = installation_id
        if not resolved_installation_id and code:
            resolved_installation_id = await resolve_personal_installation_id_from_oauth_code(code)
        if resolved_installation_id:
            return RedirectResponse(
                f"{settings.frontend_base_url.rstrip('/')}/new-scan"
                f"?github_connected=true&github_installation_id={resolved_installation_id}"
            )
        return RedirectResponse(f"{settings.frontend_base_url.rstrip('/')}/new-scan?github_error=no_installation")

    if not installation_id:
        return RedirectResponse(f"{frontend_project_base_url}?github_error=missing_params")

    try:
        # state = "project:{project_id}:{csrf_token}"
        prefix, project_id, csrf_token = state.split(":", 2)
        if prefix != "project":
            raise ValueError("not a project callback")
    except ValueError:
        return RedirectResponse(f"{frontend_project_base_url}?github_error=invalid_state")

    project_result = (
        supabase.table("projects")
        .select("github_oauth_token")
        .eq("id", project_id)
        .single()
        .execute()
    )
    if not project_result.data:
        return RedirectResponse(f"{frontend_project_base_url}?github_error=project_not_found")

    stored = project_result.data.get("github_oauth_token", "")
    if stored != f"pending:{csrf_token}":
        return RedirectResponse(f"{frontend_project_base_url}?github_error=csrf_mismatch")

    supabase.table("projects").update({
        "github_installation_id": installation_id,
        "github_oauth_token":     None,
    }).eq("id", project_id).execute()

    return RedirectResponse(
        f"{frontend_project_base_url}/{project_id}?github_connected=true"
    )


async def fetch_installation_repos(
    project_id: str, user_id: str, supabase: Client
) -> dict:
    """
    Step 3 of the OAuth flow.
    Lists repositories accessible via the stored installation token.
    """
    require_owner(project_id, user_id, supabase)

    project_result = (
        supabase.table("projects")
        .select("github_installation_id")
        .eq("id", project_id)
        .single()
        .execute()
    )
    installation_id = (
        project_result.data.get("github_installation_id") if project_result.data else None
    )

    if not installation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub App is not installed for this project. Click 'Connect with GitHub' first.",
        )

    token = await _get_installation_token(installation_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    repos = []
    page = 1
    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            resp = await client.get(
                f"{GITHUB_API}/installation/repositories",
                headers=headers,
                params={"per_page": 100, "page": page},
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="GitHub API error while listing repos",
                )
            data = resp.json()
            batch = data.get("repositories", [])
            if not batch:
                break
            repos.extend({
                "full_name": r["full_name"],
                "private":   r["private"],
                "url":       r["html_url"],
            } for r in batch)
            if len(batch) < 100:
                break
            page += 1

    return {"repos": repos}


async def select_installation_repo(
    project_id: str,
    repo_full_name: str,
    repo_url: str,
    user_id: str,
    supabase: Client,
) -> ProjectResponse:
    """
    Step 4 of the OAuth flow.
    Connects a specific repo to the project and fetches its branches using
    the installation token (no PAT needed).
    """
    require_owner(project_id, user_id, supabase)

    if not repo_full_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="repo_full_name is required",
        )

    project_result = (
        supabase.table("projects")
        .select("github_installation_id")
        .eq("id", project_id)
        .single()
        .execute()
    )
    installation_id = (
        project_result.data.get("github_installation_id") if project_result.data else None
    )
    if not installation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub App not installed. Connect first.",
        )

    token = await _get_installation_token(installation_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    branches: list[str] = []
    page = 1
    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            resp = await client.get(
                f"{GITHUB_API}/repos/{repo_full_name}/branches",
                headers=headers,
                params={"per_page": 100, "page": page},
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Failed to fetch branches",
                )
            batch = resp.json()
            if not batch:
                break
            branches.extend(b["name"] for b in batch)
            if len(batch) < 100:
                break
            page += 1

    effective_url = repo_url or f"https://github.com/{repo_full_name}"
    update_result = (
        supabase.table("projects")
        .update({
            "github_repo":     effective_url,
            "github_branches": branches,
        })
        .eq("id", project_id)
        .execute()
    )
    if not update_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return ProjectResponse(**update_result.data[0])


async def sync_branches(
    project_id: str, user_id: str, supabase: Client
) -> ProjectResponse:
    """
    Re-syncs branches using the stored installation token.
    No PAT needed — mirrors teams sync_branches exactly.
    """
    require_owner(project_id, user_id, supabase)

    project_result = (
        supabase.table("projects")
        .select("github_repo, github_installation_id")
        .eq("id", project_id)
        .single()
        .execute()
    )
    if not project_result.data or not project_result.data.get("github_repo"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No GitHub repository connected to this project",
        )

    installation_id = project_result.data.get("github_installation_id")
    if not installation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub App not installed. Reconnect GitHub first.",
        )

    repo_url = project_result.data["github_repo"]
    clean = repo_url.rstrip("/").removesuffix(".git")
    parts = clean.split("github.com/")
    if len(parts) != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GitHub repo URL stored for this project",
        )
    repo_full_name = parts[1]

    token = await _get_installation_token(installation_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    branches: list[str] = []
    page = 1
    async with httpx.AsyncClient(timeout=15.0) as client:
        while True:
            resp = await client.get(
                f"{GITHUB_API}/repos/{repo_full_name}/branches",
                headers=headers,
                params={"per_page": 100, "page": page},
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"GitHub API error while fetching branches: {resp.status_code}",
                )
            batch = resp.json()
            if not batch:
                break
            branches.extend(b["name"] for b in batch)
            if len(batch) < 100:
                break
            page += 1

    update_result = (
        supabase.table("projects")
        .update({"github_branches": branches})
        .eq("id", project_id)
        .execute()
    )
    if not update_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return ProjectResponse(**update_result.data[0])


# ---------------------------------------------------------------------------
# OAuth-based file browsing (uses stored installation token — no PAT)
# ---------------------------------------------------------------------------

def _get_project_installation_token_sync(project_id: str, supabase: Client) -> tuple[str, str]:
    """
    Returns (repo_full_name, installation_id) for a personal project.
    Raises 400 if not connected or App not installed.
    """
    result = (
        supabase.table("projects")
        .select("github_repo, github_installation_id")
        .eq("id", project_id)
        .single()
        .execute()
    )
    if not result.data or not result.data.get("github_repo"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No GitHub repository connected to this project",
        )
    installation_id = result.data.get("github_installation_id")
    if not installation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub App not installed. Reconnect GitHub first.",
        )
    repo_url = result.data["github_repo"]
    clean    = repo_url.rstrip("/").removesuffix(".git")
    parts    = clean.split("github.com/")
    if len(parts) != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GitHub repo URL stored for this project",
        )
    return parts[1], installation_id


async def fetch_branch_files_oauth(
    project_id: str, branch: str, user_id: str, supabase: Client
) -> BranchFilesResponse:
    """
    Fetch the full recursive file tree for a branch using the stored
    installation token. No PAT required — mirrors teams fetch_branch_files.
    """
    require_owner(project_id, user_id, supabase)

    repo_full_name, installation_id = _get_project_installation_token_sync(project_id, supabase)
    token = await _get_installation_token(installation_id)

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{repo_full_name}/git/trees/{branch}",
            headers=headers,
            params={"recursive": "1"},
        )

    if resp.status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Branch '{branch}' not found")
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"GitHub API error: {resp.status_code}")

    tree = resp.json().get("tree", [])
    files = [
        BranchFileItem(
            path=item["path"],
            type="directory" if item["type"] == "tree" else "file",
            size=item.get("size"),
        )
        for item in tree
    ]
    return BranchFilesResponse(branch=branch, files=files)


async def fetch_file_content_oauth(
    project_id: str, branch: str, file_path: str, user_id: str, supabase: Client
) -> FileContentResponse:
    """
    Fetch and decode a single file using the stored installation token.
    No PAT required — mirrors teams fetch_file_content.
    """
    require_owner(project_id, user_id, supabase)

    repo_full_name, installation_id = _get_project_installation_token_sync(project_id, supabase)
    token = await _get_installation_token(installation_id)

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{repo_full_name}/contents/{file_path}",
            headers=headers,
            params={"ref": branch},
        )

    if resp.status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File '{file_path}' not found on branch '{branch}'")
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"GitHub API error: {resp.status_code}")

    data    = resp.json()
    raw_b64 = data.get("content", "").replace("\n", "")
    try:
        decoded = base64.b64decode(raw_b64).decode("utf-8")
    except UnicodeDecodeError:
        decoded = "[Binary file — cannot display as text]"
    except Exception:
        decoded = "[Could not decode file content]"

    return FileContentResponse(
        branch=branch,
        path=file_path,
        content=decoded,
        size=data.get("size", 0),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Legacy PAT-based connect / refresh  (kept for manual/private repos)
# ---------------------------------------------------------------------------

async def connect_github_repo(
    project_id: str,
    repo_url: str,
    pat: str,
    user_id: str,
    supabase: Client,
) -> ProjectResponse:
    """
    Connect a GitHub repository to a personal project.

    1. Verify caller is the project owner.
    2. Parse and validate the repo URL + PAT via GitHub API.
    3. Fetch all branches (paginated).
    4. Persist github_repo and github_branches to the projects table.
    5. Return the updated ProjectResponse.
    """
    require_owner(project_id, user_id, supabase)

    owner, repo = _parse_github_owner_repo(repo_url)
    branches = await _validate_repo_and_fetch_branches(owner, repo, pat)

    update_result = (
        supabase.table("projects")
        .update({
            "github_repo":     repo_url,
            "github_branches": branches,
        })
        .eq("id", project_id)
        .execute()
    )
    if not update_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    return ProjectResponse(**update_result.data[0])


async def refresh_branches(
    project_id: str,
    repo_url: str,
    pat: str,
    user_id: str,
    supabase: Client,
) -> ProjectResponse:
    """
    Re-fetch the branch list for the project's connected repository.
    Identical flow to connect_github_repo.
    """
    return await connect_github_repo(project_id, repo_url, pat, user_id, supabase)


async def fetch_branch_files_with_pat(
    project_id: str,
    branch: str,
    pat: str,
    user_id: str,
    supabase: Client,
) -> BranchFilesResponse:
    """
    Return the full recursive file tree for a branch.

    Args:
        project_id: The personal project's UUID.
        branch:     The branch name to browse.
        pat:        Personal Access Token — used for this request only, never stored.
        user_id:    Must match project owner_id.
        supabase:   Supabase client.
    """
    require_owner(project_id, user_id, supabase)

    repo_url = _get_project_github_repo(project_id, supabase)
    owner, repo = _parse_github_owner_repo(repo_url)
    headers = _pat_headers(pat)

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{branch}",
            headers=headers,
            params={"recursive": "1"},
        )

    if resp.status_code == 401:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Personal Access Token.")
    if resp.status_code == 403:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Check PAT scopes.")
    if resp.status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Branch '{branch}' not found.")
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"GitHub API error: {resp.status_code}")

    tree = resp.json().get("tree", [])
    files = [
        BranchFileItem(
            path=item["path"],
            type="directory" if item["type"] == "tree" else "file",
            size=item.get("size"),
        )
        for item in tree
    ]

    return BranchFilesResponse(branch=branch, files=files)


async def fetch_file_content(
    project_id: str,
    branch: str,
    file_path: str,
    pat: str,
    user_id: str,
    supabase: Client,
) -> FileContentResponse:
    """
    Fetch and base64-decode a single file from a branch.

    Args:
        project_id: The personal project's UUID.
        branch:     The branch name.
        file_path:  Path within the repo (e.g. "src/main.c").
        pat:        Personal Access Token — used for this request only, never stored.
        user_id:    Must match project owner_id.
        supabase:   Supabase client.
    """
    require_owner(project_id, user_id, supabase)

    repo_url = _get_project_github_repo(project_id, supabase)
    owner, repo = _parse_github_owner_repo(repo_url)
    headers = _pat_headers(pat)

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/contents/{file_path}",
            headers=headers,
            params={"ref": branch},
        )

    if resp.status_code == 401:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Personal Access Token.")
    if resp.status_code == 403:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Check PAT scopes.")
    if resp.status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"File '{file_path}' not found on branch '{branch}'.")
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"GitHub API error: {resp.status_code}")

    data = resp.json()

    # GitHub base64-encodes content with embedded newlines — strip before decoding
    raw_b64 = data.get("content", "").replace("\n", "")
    try:
        decoded = base64.b64decode(raw_b64).decode("utf-8")
    except UnicodeDecodeError:
        decoded = "[Binary file — cannot display as text]"
    except Exception:
        decoded = "[Could not decode file content]"

    return FileContentResponse(
        branch=branch,
        path=file_path,
        content=decoded,
        size=data.get("size", 0),
        encoding="utf-8",
    )


async def fetch_selected_code_with_pat(
    project_id: str,
    branch: str,
    selected_files: List[str],
    pat: str,
    user_id: str,
    supabase: Client,
) -> Dict[str, str]:
    """
    Fetch the content of selected files for scanning, using a PAT.

    Mirrors scanner_service.fetch_selected_code_hybrid but uses PAT auth
    instead of a GitHub App installation token.

    Strategy:
    - < 50 files  → concurrent Contents API requests (fast for small batches)
    - >= 50 files → download zipball into memory and extract only needed files

    Args:
        project_id:     The personal project's UUID.
        branch:         Branch to fetch files from.
        selected_files: List of repo-relative file paths to fetch.
        pat:            Personal Access Token.
        user_id:        Must match project owner_id.
        supabase:       Supabase client.

    Returns:
        Dict mapping file_path → decoded source code (empty files are excluded).
    """
    require_owner(project_id, user_id, supabase)

    if not selected_files:
        return {}

    repo_url = _get_project_github_repo(project_id, supabase)
    owner, repo = _parse_github_owner_repo(repo_url)
    headers = _pat_headers(pat)
    files_content: Dict[str, str] = {}

    if len(selected_files) < 50:
        # Concurrent blob API — best for small selections
        async with httpx.AsyncClient(timeout=30.0) as client:
            tasks = [
                _fetch_blob_content_pat(client, owner, repo, path, branch, headers)
                for path in selected_files
            ]
            results = await asyncio.gather(*tasks)
            for file_path, content in results:
                if content:
                    files_content[file_path] = content
    else:
        # Zipball approach — one download, extract in memory
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.get(
                f"{GITHUB_API}/repos/{owner}/{repo}/zipball/{branch}",
                headers=headers,
            )
        if resp.status_code == 401:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Personal Access Token.")
        if resp.status_code == 403:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Check PAT scopes.")
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to download repository zip: {resp.status_code}",
            )

        selected_set = set(selected_files)
        zip_buffer = io.BytesIO(resp.content)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            for entry in zf.infolist():
                if entry.is_dir():
                    continue
                # GitHub zips prefix everything with "owner-repo-sha/" — strip it
                parts = entry.filename.split("/", 1)
                if len(parts) < 2:
                    continue
                actual_path = parts[1]
                if actual_path in selected_set:
                    with zf.open(entry) as f:
                        files_content[actual_path] = f.read().decode("utf-8", errors="replace")

    return files_content


async def fetch_selected_code_oauth(
    project_id: str,
    branch: str,
    selected_files: List[str],
    user_id: str,
    supabase: Client,
) -> Dict[str, str]:
    """
    Fetch the content of selected files for scanning using the stored
    GitHub App installation token — no PAT required.

    Mirrors fetch_selected_code_with_pat but authenticates via the
    installation token stored on the project after OAuth connect.
    Uses the same small-batch (blob API) vs large-batch (zipball) strategy.
    """
    require_owner(project_id, user_id, supabase)

    if not selected_files:
        return {}

    repo_full_name, installation_id = _get_project_installation_token_sync(project_id, supabase)
    token = await _get_installation_token(installation_id)

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    files_content: Dict[str, str] = {}

    if len(selected_files) < 50:
        async with httpx.AsyncClient(timeout=30.0) as client:
            tasks = [
                _fetch_blob_content_pat(client, *repo_full_name.split("/", 1), path, branch, headers)
                for path in selected_files
            ]
            results = await asyncio.gather(*tasks)
            for file_path, content in results:
                if content:
                    files_content[file_path] = content
    else:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.get(
                f"{GITHUB_API}/repos/{repo_full_name}/zipball/{branch}",
                headers=headers,
            )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to download repository zip: {resp.status_code}",
            )
        selected_set = set(selected_files)
        zip_buffer = io.BytesIO(resp.content)
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            for entry in zf.infolist():
                if entry.is_dir():
                    continue
                parts = entry.filename.split("/", 1)
                if len(parts) < 2:
                    continue
                actual_path = parts[1]
                if actual_path in selected_set:
                    with zf.open(entry) as f:
                        files_content[actual_path] = f.read().decode("utf-8", errors="replace")

    return files_content


def generate_personal_github_authorize_url() -> GithubAuthorizeResponse:
    state = "personal-github-import"
    params = urlencode(
        {
            "client_id": settings.github_client_id,
            "redirect_uri": settings.github_callback_url,
            "state": state,
        }
    )
    return GithubAuthorizeResponse(
        authorization_url=f"https://github.com/login/oauth/authorize?{params}"
    )


async def resolve_personal_installation_id_from_oauth_code(code: str) -> int | None:
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured on this server",
        )

    async with httpx.AsyncClient(timeout=20.0) as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.github_callback_url,
            },
        )
        if token_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to complete GitHub authorization: {token_response.status_code}",
            )

        token_data = token_response.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=token_data.get("error_description") or "GitHub did not return an access token",
            )

        installations_response = await client.get(
            f"{GITHUB_API}/user/installations",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )

    if installations_response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to read GitHub installations: {installations_response.status_code}",
        )

    expected_app_id = str(settings.github_app_id)
    for installation in installations_response.json().get("installations", []):
        app_slug = installation.get("app_slug") or installation.get("app", {}).get("slug")
        app_id = installation.get("app_id") or installation.get("app", {}).get("id")
        if app_slug == GITHUB_APP_SLUG or str(app_id) == expected_app_id:
            installation_id = installation.get("id")
            return int(installation_id) if installation_id else None

    return None


async def list_runtime_repos(installation_id: int) -> dict:
    token = await _get_installation_token(installation_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(f"{GITHUB_API}/installation/repositories", headers=headers)
    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch GitHub repositories: {response.status_code}",
        )
    repos = []
    for item in response.json().get("repositories", []):
        repos.append(
            {
                "full_name": item.get("full_name"),
                "private": bool(item.get("private")),
                "url": item.get("html_url"),
                "default_branch": item.get("default_branch") or "main",
                "stars": item.get("stargazers_count") or 0,
                "forks": item.get("forks_count") or 0,
            }
        )
    return {"repos": repos}


async def list_runtime_branches(installation_id: int, repo_full_name: str) -> dict:
    token = await _get_installation_token(installation_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(f"{GITHUB_API}/repos/{repo_full_name}/branches?per_page=100", headers=headers)
    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch GitHub branches: {response.status_code}",
        )
    return {"branches": [item.get("name") for item in response.json() if item.get("name")]}


async def list_runtime_files(installation_id: int, repo_full_name: str, branch: str) -> BranchFilesResponse:
    token = await _get_installation_token(installation_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{GITHUB_API}/repos/{repo_full_name}/git/trees/{branch}?recursive=1",
            headers=headers,
        )
    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch GitHub file tree: {response.status_code}",
        )
    files = [
        BranchFileItem(
            path=item["path"],
            type="file",
            size=item.get("size"),
        )
        for item in response.json().get("tree", [])
        if item.get("type") == "blob"
    ]
    return BranchFilesResponse(branch=branch, files=files)


async def fetch_selected_code_runtime(
    installation_id: int,
    repo_full_name: str,
    branch: str,
    selected_files: List[str],
) -> Dict[str, str]:
    if not selected_files:
        return {}

    token = await _get_installation_token(installation_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    files_content: Dict[str, str] = {}

    if len(selected_files) < 50:
        owner, repo = repo_full_name.split("/", 1)
        async with httpx.AsyncClient(timeout=30.0) as client:
            tasks = [
                _fetch_blob_content_pat(client, owner, repo, file_path, branch, headers)
                for file_path in selected_files
            ]
            results = await asyncio.gather(*tasks)
        for file_path, content in results:
            if content:
                files_content[file_path] = content
        return files_content

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        response = await client.get(
            f"{GITHUB_API}/repos/{repo_full_name}/zipball/{branch}",
            headers=headers,
        )
    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to download repository zip: {response.status_code}",
        )

    selected_set = set(selected_files)
    with zipfile.ZipFile(io.BytesIO(response.content), "r") as archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            parts = entry.filename.split("/", 1)
            if len(parts) < 2:
                continue
            actual_path = parts[1]
            if actual_path in selected_set:
                with archive.open(entry) as file_obj:
                    files_content[actual_path] = file_obj.read().decode("utf-8", errors="replace")
    return files_content
