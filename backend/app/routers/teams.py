from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from supabase import Client
import httpx
import secrets
import time
import jwt                    # PyJWT — signs GitHub App JWTs with RSA key
from pathlib import Path

from app.dependencies import get_supabase, get_current_user
from app.config import settings
from app.models.teams import (
    TeamCreateRequest,
    TeamUpdateRequest,
    ConnectGithubRequest,
    InviteMemberRequest,
    UpdateMemberRequest,
    TeamResponse,
    TeamListResponse,
    TeamMemberResponse,
    TeamMemberBase,
    MemberProfile,
    TeamRole,
    GithubAuthorizeResponse,
)

router = APIRouter()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GITHUB_API = "https://api.github.com"
FRONTEND_TEAM_URL = "http://localhost:8080/team"

# GitHub App slug — must match the URL slug on github.com/settings/apps
GITHUB_APP_SLUG = "secureguard-pro"

# ---------------------------------------------------------------------------
# GitHub App helpers
# ---------------------------------------------------------------------------

def _load_private_key() -> str:
    """Reads the RSA private key from the .pem file."""
    pem_path = Path(settings.github_private_key_path)
    if not pem_path.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub App private key not found on server",
        )
    return pem_path.read_text()


def _make_github_app_jwt() -> str:
    """
    Creates a short-lived JWT signed with our RSA private key.
    GitHub uses this to verify we are the registered GitHub App.

    Why JWT?
    GitHub Apps authenticate as the app itself using a JWT, then exchange
    it for an installation access token scoped to a specific user/org.
    The JWT is valid for max 10 minutes — we use 8 to be safe.
    """
    now = int(time.time())
    payload = {
        "iat": now - 60,          # issued at (60s in past — clock skew buffer)
        "exp": now + (8 * 60),    # expires in 8 minutes
        "iss": settings.github_app_id,
    }
    private_key = _load_private_key()
    return jwt.encode(payload, private_key, algorithm="RS256")


async def _get_installation_token(installation_id: int) -> str:
    """
    Exchanges a GitHub App JWT for an installation access token.

    Flow:
    1. We sign a JWT with our private key → proves we are the GitHub App
    2. We POST to GitHub with that JWT → get an installation token
    3. Installation token has read-only access to repos the user selected
    4. Token expires in 1 hour — we use it immediately, don't store it

    Why installation token instead of user token?
    - Scoped to exactly the repos the user chose during install
    - Read-only by default (matches our Contents:read permission)
    - No broad account access
    """
    app_jwt = _make_github_app_jwt()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{GITHUB_API}/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
    if resp.status_code != 201:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to get GitHub installation token: {resp.status_code}",
        )
    return resp.json()["token"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
# Private functions (prefixed with _) used only within this module.
# DRY principle: shared logic extracted once, called from multiple routes.
# ---------------------------------------------------------------------------

def _require_admin(team_id: str, user_id: str, supabase: Client) -> None:
    """
    Raises 403 if the given user is not an admin of the given team.
    Called at the top of every admin-only endpoint.
    """
    result = (
        supabase.table("team_members")
        .select("role")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data or result.data["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team admins can perform this action",
        )


def _require_member(team_id: str, user_id: str, supabase: Client) -> dict:
    """
    Raises 403 if the user is not a member of the team.
    Returns the membership row so callers can read the role without a second query.
    """
    result = (
        supabase.table("team_members")
        .select("*")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this team",
        )
    return result.data


def _build_team_response(team: dict, members: list, current_user_id: str) -> TeamResponse:
    """
    Assembles a TeamResponse from raw DB rows.
    Centralises the mapping logic — called from GET /teams and GET /teams/{id}.
    """
    # Find the calling user's role in this team
    current_user_role = TeamRole.viewer
    for m in members:
        if m["user_id"] == current_user_id:
            current_user_role = TeamRole(m["role"])
            break

    member_responses = [
        TeamMemberResponse(
            id=m["id"],
            user_id=m["user_id"],
            role=TeamRole(m["role"]),
            branch=m.get("branch"),
            joined_at=m["created_at"],
            profile=MemberProfile(
                id=m["user_id"],
                full_name=m.get("profiles", {}).get("full_name") if m.get("profiles") else None,
                avatar_url=m.get("profiles", {}).get("avatar_url") if m.get("profiles") else None,
                email=m.get("email"),  # injected separately (see _enrich_members_with_email)
            ),
        )
        for m in members
    ]

    return TeamResponse(
        id=team["id"],
        name=team["name"],
        github_repo=team.get("github_repo"),
        github_branches=team.get("github_branches") or [],
        created_by=team["created_by"],
        created_at=team["created_at"],
        updated_at=team["updated_at"],
        current_user_role=current_user_role,
        member_count=len(member_responses),
        members=member_responses,
    )


def _fetch_members_for_team(team_id: str, supabase: Client) -> list:
    """
    Fetches all team_members rows for a team, then enriches each with profile data.

    Why two queries instead of a join?
    team_members.user_id → auth.users.id → profiles.id
    PostgREST cannot auto-join across the auth schema boundary, so we fetch
    profiles separately using the collected user_ids and merge in Python.
    """
    members_result = (
        supabase.table("team_members")
        .select("*")
        .eq("team_id", team_id)
        .execute()
    )
    members = members_result.data or []
    if not members:
        return []

    # Collect all user_ids, fetch their profiles in one query
    user_ids = [m["user_id"] for m in members]
    profiles_result = (
        supabase.table("profiles")
        .select("id, full_name, avatar_url")
        .in_("id", user_ids)
        .execute()
    )
    # Build a lookup dict: user_id → profile row
    profiles_map = {p["id"]: p for p in (profiles_result.data or [])}

    # Attach profile data to each member row
    for m in members:
        m["profiles"] = profiles_map.get(m["user_id"], {})

    return members


# ---------------------------------------------------------------------------
# GET /teams
# ---------------------------------------------------------------------------
# Returns all teams the current user belongs to, with full member lists.
# This is the primary load call — Team.tsx calls this on mount.
# ---------------------------------------------------------------------------

@router.get("", response_model=TeamListResponse)
async def list_teams(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns every team the authenticated user is a member of.
    Each team includes the full member list and the caller's role.
    """
    user_id = current_user.id

    # Step 1: find all team_ids this user belongs to
    memberships = (
        supabase.table("team_members")
        .select("team_id")
        .eq("user_id", user_id)
        .execute()
    )
    team_ids = [m["team_id"] for m in (memberships.data or [])]

    if not team_ids:
        return TeamListResponse(teams=[])

    # Step 2: fetch those teams
    teams_result = (
        supabase.table("teams")
        .select("*")
        .in_("id", team_ids)
        .execute()
    )
    teams = teams_result.data or []

    # Step 3: build full response for each team
    team_responses = []
    for team in teams:
        members = _fetch_members_for_team(team["id"], supabase)
        team_responses.append(_build_team_response(team, members, user_id))

    return TeamListResponse(teams=team_responses)


# ---------------------------------------------------------------------------
# POST /teams
# ---------------------------------------------------------------------------
# Creates a new team and automatically adds the creator as admin.
# ---------------------------------------------------------------------------

@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    body: TeamCreateRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Creates a new team. The authenticated user becomes the admin automatically.
    """
    user_id = current_user.id

    # Insert the team row
    team_result = (
        supabase.table("teams")
        .insert({"name": body.name, "created_by": user_id})
        .execute()
    )
    team = team_result.data[0]

    # Add creator as admin member
    supabase.table("team_members").insert({
        "team_id": team["id"],
        "user_id": user_id,
        "role":    "admin",
    }).execute()

    # Return the full team object (with the creator as the only member)
    members = _fetch_members_for_team(team["id"], supabase)
    return _build_team_response(team, members, user_id)


# ---------------------------------------------------------------------------
# GET /teams/{team_id}
# ---------------------------------------------------------------------------

@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    team_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns a single team by ID.
    The caller must be a member of the team.
    """
    user_id = current_user.id
    _require_member(team_id, user_id, supabase)  # 403 if not a member

    team_result = (
        supabase.table("teams")
        .select("*")
        .eq("id", team_id)
        .single()
        .execute()
    )
    if not team_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members = _fetch_members_for_team(team_id, supabase)
    return _build_team_response(team_result.data, members, user_id)


# ---------------------------------------------------------------------------
# PATCH /teams/{team_id}
# ---------------------------------------------------------------------------
# Covers: rename team, connect GitHub repo, disconnect GitHub repo.
# Admin only.
# ---------------------------------------------------------------------------

@router.patch("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    body: TeamUpdateRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Partial update for a team (name, github_repo).
    Only admins can call this.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    # Build update payload — only include fields that were actually sent
    updates = {}
    if body.name        is not None: updates["name"]        = body.name
    if body.github_repo is not None: updates["github_repo"] = body.github_repo

    # Allow explicitly setting github_repo to empty string to disconnect
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided to update",
        )

    team_result = (
        supabase.table("teams")
        .update(updates)
        .eq("id", team_id)
        .execute()
    )
    if not team_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members = _fetch_members_for_team(team_id, supabase)
    return _build_team_response(team_result.data[0], members, user_id)


# ---------------------------------------------------------------------------
# DELETE /teams/{team_id}
# ---------------------------------------------------------------------------
# Admin only. Cascades to team_members (handled by DB ON DELETE CASCADE).
# ---------------------------------------------------------------------------

@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Permanently deletes a team and removes all members.
    Only the team admin can do this.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    supabase.table("teams").delete().eq("id", team_id).execute()


# ---------------------------------------------------------------------------
# POST /teams/{team_id}/github
# ---------------------------------------------------------------------------
# Connect a GitHub repo. Uses PAT once to validate + fetch branches, then
# discards it. Saves repo URL + branch list to DB. PAT never stored.
# Admin only.
# ---------------------------------------------------------------------------

def _parse_github_owner_repo(repo_url: str) -> tuple[str, str]:
    """
    Extracts owner and repo name from a GitHub URL.
    Supports:
      https://github.com/owner/repo
      https://github.com/owner/repo.git
    Returns (owner, repo) tuple.
    """
    # Strip trailing .git and slashes
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


@router.post("/{team_id}/github", response_model=TeamResponse)
async def connect_github(
    team_id: str,
    body: ConnectGithubRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Connects a GitHub repository to the team.

    Flow:
    1. Validate the repo URL format
    2. Call GitHub API with the PAT to verify access + fetch branches
    3. Save repo URL + branch list to DB
    4. PAT is discarded — never stored

    Admin only.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    owner, repo = _parse_github_owner_repo(body.repo_url)

    headers = {
        "Authorization": f"Bearer {body.pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Step 1: verify repo exists and PAT has access
        repo_resp = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}", headers=headers)

        if repo_resp.status_code == 401:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Personal Access Token. Please check your PAT and try again.",
            )
        if repo_resp.status_code == 403:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Make sure your PAT has 'repo' (read) scope.",
            )
        if repo_resp.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repository not found. Check the URL and that your PAT has access to this repo.",
            )
        if repo_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"GitHub API error: {repo_resp.status_code}",
            )

        # Step 2: fetch all branches (paginated — up to 100 per page)
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
                break  # last page
            page += 1

    # PAT is now out of scope — never written to DB

    # Step 3: save repo URL + branches to DB
    team_result = (
        supabase.table("teams")
        .update({
            "github_repo":     body.repo_url,
            "github_branches": branches,
        })
        .eq("id", team_id)
        .execute()
    )
    if not team_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members = _fetch_members_for_team(team_id, supabase)
    return _build_team_response(team_result.data[0], members, user_id)


# ---------------------------------------------------------------------------
# POST /teams/{team_id}/github/refresh
# ---------------------------------------------------------------------------
# Re-fetch branches from GitHub using a fresh PAT.
# Same flow as connect — PAT used once, discarded.
# Admin only.
# ---------------------------------------------------------------------------

@router.post("/{team_id}/github/refresh", response_model=TeamResponse)
async def refresh_github_branches(
    team_id: str,
    body: ConnectGithubRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Refreshes the branch list from GitHub.
    Requires the PAT again (we never stored it).
    Admin only.
    """
    # Reuse the same logic as connect — it's identical
    return await connect_github(team_id, body, current_user, supabase)


# ---------------------------------------------------------------------------
# GET /teams/github/callback
# ---------------------------------------------------------------------------
# IMPORTANT: This route MUST be registered before /{team_id}/... routes.
# If it comes after, FastAPI will match "github" as a team_id and never
# reach this handler.
# ---------------------------------------------------------------------------

@router.get("/github/callback")
async def github_callback(
    installation_id: int | None = None,
    setup_action: str | None = None,
    state: str | None = None,
    code: str | None = None,
    supabase: Client = Depends(get_supabase),
):
    """
    GitHub App callback handler.

    GitHub sends:
    - installation_id: the unique ID for this user's app installation
    - setup_action: "install" or "update"
    - state: our "{team_id}:{csrf_token}" string

    Flow:
    1. Verify CSRF state
    2. Store installation_id in DB
    3. Immediately fetch repos + branches using an installation token
    4. Redirect user back to /team page
    """
    if not state or not installation_id:
        return RedirectResponse(f"{FRONTEND_TEAM_URL}?github_error=missing_params")

    # Parse state
    try:
        team_id, csrf_token = state.split(":", 1)
    except ValueError:
        return RedirectResponse(f"{FRONTEND_TEAM_URL}?github_error=invalid_state")

    # Verify CSRF
    team_result = supabase.table("teams").select("github_oauth_token").eq("id", team_id).single().execute()
    if not team_result.data:
        return RedirectResponse(f"{FRONTEND_TEAM_URL}?github_error=team_not_found")

    stored = team_result.data.get("github_oauth_token", "")
    if stored != f"pending:{csrf_token}":
        return RedirectResponse(f"{FRONTEND_TEAM_URL}?github_error=csrf_mismatch")

    # Store installation_id — this is all we need going forward
    supabase.table("teams").update({
        "github_installation_id": installation_id,
        "github_oauth_token":     None,   # clear the pending CSRF token
    }).eq("id", team_id).execute()

    # Redirect to frontend — repo picker will load via /github/repos
    return RedirectResponse(f"{FRONTEND_TEAM_URL}?github_connected=true&team_id={team_id}")


# ---------------------------------------------------------------------------
# GET /teams/{team_id}/github/authorize
# ---------------------------------------------------------------------------
# Step 1 of GitHub App flow.
# Returns the GitHub App installation URL the frontend redirects the user to.
# Embeds team_id in the `state` param so the callback knows which team to update.
# Admin only.
# ---------------------------------------------------------------------------

@router.get("/{team_id}/github/authorize", response_model=GithubAuthorizeResponse)
async def github_authorize(
    team_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns the GitHub App installation URL.

    GitHub App flow:
    - User goes to the GitHub App install page
    - They select which repos to grant access to
    - GitHub redirects to our callback with an installation_id
    - We use that installation_id to get tokens on demand

    State param = "{team_id}:{csrf_token}" — CSRF protection.
    """
    if not settings.github_app_id or not settings.github_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub App is not configured on this server",
        )

    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    # CSRF token stored temporarily so callback can verify
    csrf_token = secrets.token_urlsafe(32)
    state = f"{team_id}:{csrf_token}"
    supabase.table("teams").update({"github_oauth_token": f"pending:{csrf_token}"}).eq("id", team_id).execute()

    # GitHub App installation URL — user picks repos here
    # After install, GitHub redirects to our callback_url with installation_id
    authorization_url = (
        f"https://github.com/apps/{GITHUB_APP_SLUG}/installations/new"
        f"?state={state}"
    )

    return GithubAuthorizeResponse(authorization_url=authorization_url)


# ---------------------------------------------------------------------------
# GET /teams/{team_id}/github/repos
# ---------------------------------------------------------------------------
# After OAuth, fetch the list of repos the user has access to.
# User picks one, then we call /github/select-repo to connect it.
# Admin only.
# ---------------------------------------------------------------------------

@router.get("/{team_id}/github/repos")
async def list_github_repos(
    team_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns repos accessible via the GitHub App installation.
    Uses a fresh installation token — never stored.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

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


@router.post("/{team_id}/github/select-repo", response_model=TeamResponse)
async def select_github_repo(
    team_id: str,
    body: dict,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Connects a specific repo and fetches its branches using an installation token.
    Token is used once and discarded — never stored.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    repo_full_name = body.get("repo_full_name", "").strip()
    repo_url       = body.get("repo_url", "").strip()

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
    }).eq("id", team_id).execute()

    members = _fetch_members_for_team(team_id, supabase)
    return _build_team_response(team_upd.data[0], members, user_id)


# ---------------------------------------------------------------------------
# POST /teams/{team_id}/members
# ---------------------------------------------------------------------------
# Invite a user by email. Looks up their account — if found, adds them.
# Admin only.
# ---------------------------------------------------------------------------

@router.post("/{team_id}/members", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
async def invite_member(
    team_id: str,
    body: InviteMemberRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Adds a user to the team by their email address.
    The user must already have an account in the system.
    Admin only.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    # Look up the invitee's user ID from auth.users via service_role
    # We use the admin API (list_users) to find by email
    users_response = supabase.auth.admin.list_users()
    invitee = next(
        (u for u in users_response if u.email and u.email.lower() == body.email),
        None,
    )

    if not invitee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with that email address",
        )

    if invitee.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already a member of this team",
        )

    # Check if already a member
    existing = (
        supabase.table("team_members")
        .select("id")
        .eq("team_id", team_id)
        .eq("user_id", invitee.id)
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This user is already a member of the team",
        )

    # Add the member
    member_result = (
        supabase.table("team_members")
        .insert({
            "team_id": team_id,
            "user_id": invitee.id,
            "role":    body.role.value,
        })
        .execute()
    )
    new_member = member_result.data[0]

    # Fetch their profile for the response
    profile_result = (
        supabase.table("profiles")
        .select("full_name, avatar_url")
        .eq("id", invitee.id)
        .single()
        .execute()
    )
    profile_data = profile_result.data or {}

    return TeamMemberResponse(
        id=new_member["id"],
        user_id=invitee.id,
        role=TeamRole(new_member["role"]),
        branch=new_member.get("branch"),
        joined_at=new_member["created_at"],
        profile=MemberProfile(
            id=invitee.id,
            full_name=profile_data.get("full_name"),
            avatar_url=profile_data.get("avatar_url"),
            email=invitee.email,
        ),
    )


# ---------------------------------------------------------------------------
# PATCH /teams/{team_id}/members/{member_user_id}
# ---------------------------------------------------------------------------
# Update a member's role and/or assigned branch.
# Admin only. Admins cannot demote themselves.
# ---------------------------------------------------------------------------

@router.patch("/{team_id}/members/{member_user_id}", response_model=TeamMemberResponse)
async def update_member(
    team_id: str,
    member_user_id: str,
    body: UpdateMemberRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Updates a team member's role and/or branch assignment.
    Admin only. An admin cannot change their own role.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    if member_user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot change their own role",
        )

    updates: dict = {"role": body.role.value}
    if body.branch is not None:
        updates["branch"] = body.branch

    member_result = (
        supabase.table("team_members")
        .update(updates)
        .eq("team_id", team_id)
        .eq("user_id", member_user_id)
        .execute()
    )
    if not member_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    updated = member_result.data[0]

    profile_result = (
        supabase.table("profiles")
        .select("full_name, avatar_url")
        .eq("id", member_user_id)
        .single()
        .execute()
    )
    profile_data = profile_result.data or {}

    return TeamMemberResponse(
        id=updated["id"],
        user_id=member_user_id,
        role=TeamRole(updated["role"]),
        branch=updated.get("branch"),
        joined_at=updated["created_at"],
        profile=MemberProfile(
            id=member_user_id,
            full_name=profile_data.get("full_name"),
            avatar_url=profile_data.get("avatar_url"),
            email=None,  # not needed for update response
        ),
    )


# ---------------------------------------------------------------------------
# DELETE /teams/{team_id}/members/{member_user_id}
# ---------------------------------------------------------------------------
# Remove a member from the team.
# Admin only. Admins cannot remove themselves.
# ---------------------------------------------------------------------------

@router.delete("/{team_id}/members/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    team_id: str,
    member_user_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Removes a member from the team.
    Admin only. An admin cannot remove themselves.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    if member_user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot remove themselves from the team",
        )

    supabase.table("team_members").delete().eq("team_id", team_id).eq("user_id", member_user_id).execute()
