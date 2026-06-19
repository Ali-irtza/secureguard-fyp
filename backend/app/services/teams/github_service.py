import httpx
import time
import jwt
import secrets
from pathlib import Path
from fastapi import HTTPException, status
from fastapi.responses import RedirectResponse
from supabase import Client

from app.config import settings
from app.models.teams import TeamResponse, GithubAuthorizeResponse, BranchFileItem, BranchFilesResponse, FileContentResponse
from app.services.teams.team_service import require_admin, require_member, fetch_members_for_team, build_team_response

GITHUB_API = "https://api.github.com"
GITHUB_APP_SLUG = "secureguard-pro"
INSTALLATION_TOKEN_REFRESH_BUFFER_SECONDS = 5 * 60
_installation_token_cache: dict[int, tuple[str, float]] = {}

def _frontend_team_url() -> str:
    return f"{settings.frontend_base_url.rstrip('/')}/team"

def _load_private_key() -> str:
    pem_path = Path(settings.github_private_key_path)
    if not pem_path.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub App private key not found on server",
        )
    return pem_path.read_text()

def _make_github_app_jwt() -> str:
    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + (8 * 60),
        "iss": settings.github_app_id,
    }
    private_key = _load_private_key()
    return jwt.encode(payload, private_key, algorithm="RS256")

async def _get_installation_token(installation_id: int) -> str:
    now = time.time()
    cached = _installation_token_cache.get(installation_id)
    if cached:
        token, expires_at = cached
        if expires_at - INSTALLATION_TOKEN_REFRESH_BUFFER_SECONDS > now:
            return token

    app_jwt = _make_github_app_jwt()
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{GITHUB_API}/app/installations/{installation_id}/access_tokens",
                headers={
                    "Authorization": f"Bearer {app_jwt}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="GitHub timed out while creating an installation token. Try again.",
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach GitHub while creating an installation token.",
        )
    if resp.status_code != 201:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to get GitHub installation token: {resp.status_code}",
        )
    data = resp.json()
    token = data["token"]
    expires_at_raw = data.get("expires_at")
    expires_at = now + 55 * 60
    if expires_at_raw:
        try:
            from datetime import datetime
            expires_at = datetime.fromisoformat(
                expires_at_raw.replace("Z", "+00:00")
            ).timestamp()
        except ValueError:
            pass

    _installation_token_cache[installation_id] = (token, expires_at)
    return token

def _parse_github_owner_repo(repo_url: str) -> tuple[str, str]:
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

async def connect_github_repo(team_id: str, repo_url: str, pat: str, user_id: str, supabase: Client) -> TeamResponse:
    require_admin(team_id, user_id, supabase)

    owner, repo = _parse_github_owner_repo(repo_url)

    headers = {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        repo_resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}", headers=headers)

        if repo_resp.status_code == 401:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Personal Access Token.")
        if repo_resp.status_code == 403:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Check PAT scopes.")
        if repo_resp.status_code == 404:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found.")
        if repo_resp.status_code != 200:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"GitHub API error: {repo_resp.status_code}")

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

    team_result = (
        supabase.table("teams")
        .update({
            "github_repo":     repo_url,
            "github_branches": branches,
        })
        .eq("id", team_id)
        .execute()
    )
    if not team_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members = fetch_members_for_team(team_id, supabase)
    return build_team_response(team_result.data[0], members, user_id)

async def sync_branches(team_id: str, user_id: str, supabase: Client) -> TeamResponse:
    """
    Re-fetches the branch list for the team's connected repository using the
    stored GitHub App installation token. No PAT required — runs silently
    in the background without any browser redirect or modal.
    """
    require_admin(team_id, user_id, supabase)

    repo_full_name, installation_id = _get_repo_full_name(team_id, supabase)
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

    team_result = (
        supabase.table("teams")
        .update({"github_branches": branches})
        .eq("id", team_id)
        .execute()
    )
    if not team_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members = fetch_members_for_team(team_id, supabase)
    return build_team_response(team_result.data[0], members, user_id)


async def refresh_branches(team_id: str, repo_url: str, pat: str, user_id: str, supabase: Client) -> TeamResponse:
    return await connect_github_repo(team_id, repo_url, pat, user_id, supabase)

async def process_github_callback(installation_id: int | None, state: str | None, supabase: Client, code: str | None = None) -> RedirectResponse:
    frontend_team_url = _frontend_team_url()
    if state == "personal-github-import":
        resolved_installation_id = installation_id
        if not resolved_installation_id and code:
            from app.services.projects.project_github_service import resolve_personal_installation_id_from_oauth_code

            resolved_installation_id = await resolve_personal_installation_id_from_oauth_code(code)
        if resolved_installation_id:
            return RedirectResponse(
                f"{settings.frontend_base_url.rstrip('/')}/new-scan"
                f"?github_connected=true&github_installation_id={resolved_installation_id}"
            )
        return RedirectResponse(f"{settings.frontend_base_url.rstrip('/')}/new-scan?github_error=no_installation")

    if not state or not installation_id:
        return RedirectResponse(f"{frontend_team_url}?github_error=missing_params")

    # Route project callbacks — state starts with "project:" when initiated
    # from a personal project's GitHub authorize flow.
    if state.startswith("project:"):
        from app.services.projects.project_github_service import process_github_callback as project_callback
        return await project_callback(installation_id, state, supabase)

    try:
        team_id, csrf_token = state.split(":", 1)
    except ValueError:
        return RedirectResponse(f"{frontend_team_url}?github_error=invalid_state")

    team_result = supabase.table("teams").select("github_oauth_token").eq("id", team_id).single().execute()
    if not team_result.data:
        return RedirectResponse(f"{frontend_team_url}?github_error=team_not_found")

    stored = team_result.data.get("github_oauth_token", "")
    if stored != f"pending:{csrf_token}":
        return RedirectResponse(f"{frontend_team_url}?github_error=csrf_mismatch")

    supabase.table("teams").update({
        "github_installation_id": installation_id,
        "github_oauth_token":     None,
    }).eq("id", team_id).execute()

    return RedirectResponse(f"{frontend_team_url}?github_connected=true&team_id={team_id}")

def generate_github_authorize_url(team_id: str, user_id: str, supabase: Client) -> GithubAuthorizeResponse:
    if not settings.github_app_id or not settings.github_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub App is not configured on this server",
        )

    require_admin(team_id, user_id, supabase)

    csrf_token = secrets.token_urlsafe(32)
    state = f"{team_id}:{csrf_token}"
    supabase.table("teams").update({"github_oauth_token": f"pending:{csrf_token}"}).eq("id", team_id).execute()

    authorization_url = (
        f"https://github.com/apps/{GITHUB_APP_SLUG}/installations/new"
        f"?state={state}"
    )

    return GithubAuthorizeResponse(authorization_url=authorization_url)

async def fetch_installation_repos(team_id: str, user_id: str, supabase: Client) -> dict:
    require_admin(team_id, user_id, supabase)

    team_result = supabase.table("teams").select("github_installation_id").eq("id", team_id).single().execute()
    installation_id = team_result.data.get("github_installation_id") if team_result.data else None

    if not installation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub App is not installed for this team. Click 'Connect with GitHub' first.",
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
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="GitHub API error")
            data = resp.json()
            batch = data.get("repositories", [])
            if not batch:
                break
            repos.extend({"full_name": r["full_name"], "private": r["private"], "url": r["html_url"]} for r in batch)
            if len(batch) < 100:
                break
            page += 1

    return {"repos": repos}

async def select_installation_repo(team_id: str, repo_full_name: str, repo_url: str, user_id: str, supabase: Client) -> TeamResponse:
    require_admin(team_id, user_id, supabase)

    if not repo_full_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="repo_full_name is required")

    team_result = supabase.table("teams").select("github_installation_id").eq("id", team_id).single().execute()
    installation_id = team_result.data.get("github_installation_id") if team_result.data else None

    if not installation_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GitHub App not installed. Connect first.")

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
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to fetch branches")
            batch = resp.json()
            if not batch:
                break
            branches.extend(b["name"] for b in batch)
            if len(batch) < 100:
                break
            page += 1

    team_upd = supabase.table("teams").update({
        "github_repo":     repo_url or f"https://github.com/{repo_full_name}",
        "github_branches": branches,
        "github_oauth_token": None,
    }).eq("id", team_id).execute()

    members = fetch_members_for_team(team_id, supabase)
    return build_team_response(team_upd.data[0], members, user_id)


# ---------------------------------------------------------------------------
# Branch file browsing
# ---------------------------------------------------------------------------

def _check_branch_access(team_id: str, user_id: str, branch: str, supabase: Client) -> None:
    """
    Ensures the user has permission to view files for the given branch.
    - admin  → any branch
    - developer → only their assigned branches (can have multiple)
    - viewer → denied
    """
    membership = require_member(team_id, user_id, supabase)
    role = membership["role"]

    if role == "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Viewers do not have access to branch files",
        )

    if role == "developer":
        assigned_branches = membership.get("branches")
        if not assigned_branches:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No branches assigned. Ask your team admin to assign branches.",
            )
        if branch not in assigned_branches:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You only have access to branches: {', '.join(assigned_branches)}",
            )
    # admin → allowed for any branch


def _get_repo_full_name(team_id: str, supabase: Client) -> tuple[str, int]:
    """Returns (repo_full_name, installation_id) for a team."""
    team = supabase.table("teams").select(
        "github_repo, github_installation_id"
    ).eq("id", team_id).single().execute()

    if not team.data or not team.data.get("github_repo"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No GitHub repository connected to this team",
        )

    installation_id = team.data.get("github_installation_id")
    if not installation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub App not installed. Reconnect GitHub first.",
        )

    repo_url = team.data["github_repo"]
    # Extract owner/repo from URL
    clean = repo_url.rstrip("/").removesuffix(".git")
    parts = clean.split("github.com/")
    if len(parts) == 2:
        return parts[1], installation_id

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid GitHub repo URL stored for this team",
    )


async def fetch_branch_files(
    team_id: str, branch: str, user_id: str, supabase: Client
) -> BranchFilesResponse:
    """Fetches the full recursive file tree for a branch."""
    _check_branch_access(team_id, user_id, branch, supabase)

    repo_full_name, installation_id = _get_repo_full_name(team_id, supabase)
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Branch '{branch}' not found",
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"GitHub API error: {resp.status_code}",
        )

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
    team_id: str, branch: str, file_path: str, user_id: str, supabase: Client
) -> FileContentResponse:
    """Fetches the decoded content of a single file from a branch."""
    _check_branch_access(team_id, user_id, branch, supabase)

    repo_full_name, installation_id = _get_repo_full_name(team_id, supabase)
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{file_path}' not found on branch '{branch}'",
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"GitHub API error: {resp.status_code}",
        )

    data = resp.json()

    # GitHub returns base64-encoded content for files
    import base64
    raw_content = data.get("content", "")
    try:
        decoded = base64.b64decode(raw_content).decode("utf-8")
    except Exception:
        decoded = "[Binary file — cannot display]"

    return FileContentResponse(
        branch=branch,
        path=file_path,
        content=decoded,
        size=data.get("size", 0),
        encoding="utf-8",
    )
