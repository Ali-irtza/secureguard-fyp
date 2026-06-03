from fastapi import APIRouter, Depends, status
from fastapi.responses import RedirectResponse
from supabase import Client

from app.dependencies import get_supabase, get_current_user
from app.models.teams import (
    TeamCreateRequest,
    TeamUpdateRequest,
    ConnectGithubRequest,
    InviteMemberRequest,
    UpdateMemberRequest,
    TeamResponse,
    TeamListResponse,
    TeamMemberResponse,
    GithubAuthorizeResponse,
    BranchFilesResponse,
    FileContentResponse,
    TeamDashboardResponse,
)
from app.services.teams import team_service, member_service, github_service

router = APIRouter()

@router.get("", response_model=TeamListResponse)
async def list_teams(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return team_service.list_user_teams(current_user.id, supabase)

@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    body: TeamCreateRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return team_service.create_new_team(body.name, current_user.id, supabase)

@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    team_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return team_service.get_team_by_id(team_id, current_user.id, supabase)

@router.get("/{team_id}/dashboard", response_model=TeamDashboardResponse)
async def get_team_dashboard(
    team_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return team_service.get_team_dashboard(team_id, current_user.id, supabase)

@router.patch("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    body: TeamUpdateRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return team_service.update_team_details(team_id, current_user.id, body.name, body.github_repo, supabase)

@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    team_service.delete_team_by_id(team_id, current_user.id, supabase)

@router.post("/{team_id}/github", response_model=TeamResponse)
async def connect_github(
    team_id: str,
    body: ConnectGithubRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return await github_service.connect_github_repo(team_id, body.repo_url, body.pat, current_user.id, supabase)

@router.post("/{team_id}/github/refresh", response_model=TeamResponse)
async def refresh_github_branches(
    team_id: str,
    body: ConnectGithubRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return await github_service.refresh_branches(team_id, body.repo_url, body.pat, current_user.id, supabase)

@router.post("/{team_id}/github/sync-branches", response_model=TeamResponse)
async def sync_github_branches(
    team_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Re-syncs branches for the connected repository using the stored GitHub App
    installation token. No PAT or request body required.
    """
    return await github_service.sync_branches(team_id, current_user.id, supabase)

@router.get("/github/callback")
async def github_callback(
    installation_id: int | None = None,
    setup_action: str | None = None,
    state: str | None = None,
    code: str | None = None,
    supabase: Client = Depends(get_supabase),
):
    return await github_service.process_github_callback(installation_id, state, supabase)

@router.get("/{team_id}/github/authorize", response_model=GithubAuthorizeResponse)
async def github_authorize(
    team_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return github_service.generate_github_authorize_url(team_id, current_user.id, supabase)

@router.get("/{team_id}/github/repos")
async def list_github_repos(
    team_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return await github_service.fetch_installation_repos(team_id, current_user.id, supabase)

@router.post("/{team_id}/github/select-repo", response_model=TeamResponse)
async def select_github_repo(
    team_id: str,
    body: dict,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return await github_service.select_installation_repo(
        team_id, 
        body.get("repo_full_name", "").strip(), 
        body.get("repo_url", "").strip(), 
        current_user.id, 
        supabase
    )

@router.post("/{team_id}/github/connect-repo", response_model=TeamResponse)
async def connect_repo_instant(
    team_id: str,
    body: dict,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Fast-connect: saves the repo URL immediately with an empty branch list
    and returns. The client should follow up with /sync-branches to populate
    branches in the background while showing a skeleton loader.
    """
    return await github_service.connect_repo_instant(
        team_id,
        body.get("repo_full_name", "").strip(),
        body.get("repo_url", "").strip(),
        current_user.id,
        supabase,
    )

@router.post("/{team_id}/members", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
async def invite_member(
    team_id: str,
    body: InviteMemberRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return member_service.invite_user_to_team(team_id, body.email, body.role.value, current_user.id, supabase)

@router.patch("/{team_id}/members/{member_user_id}", response_model=TeamMemberResponse)
async def update_member(
    team_id: str,
    member_user_id: str,
    body: UpdateMemberRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return member_service.update_team_member(
        team_id, 
        member_user_id, 
        body.role.value if body.role else None, 
        body.branches, 
        current_user.id, 
        supabase
    )

@router.delete("/{team_id}/members/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    team_id: str,
    member_user_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    member_service.remove_team_member(team_id, member_user_id, current_user.id, supabase)

@router.get("/{team_id}/branches/{branch:path}/files/content", response_model=FileContentResponse)
async def get_file_content(
    team_id: str,
    branch: str,
    path: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return await github_service.fetch_file_content(team_id, branch, path, current_user.id, supabase)

@router.get("/{team_id}/branches/{branch:path}/files", response_model=BranchFilesResponse)
async def get_branch_files(
    team_id: str,
    branch: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return await github_service.fetch_branch_files(team_id, branch, current_user.id, supabase)
