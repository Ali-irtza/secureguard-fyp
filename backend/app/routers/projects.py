# ---------------------------------------------------------------------------
# Route Ordering Notes
# ---------------------------------------------------------------------------
# 1. DELETE "/bulk-delete" MUST stay before "/{project_id}" — FastAPI matches
#    in registration order, so the literal "bulk-delete" would otherwise be
#    swallowed as a project_id path parameter.
# 2. GitHub file-content routes MUST be registered before the generic
#    "/{project_id}/branches/{branch}/files" route because FastAPI would
#    otherwise never reach the more-specific "/files/content" path.
# ---------------------------------------------------------------------------

import time

from fastapi import APIRouter, Depends, Query, status
from supabase import Client

from app.dependencies import get_supabase, get_current_user
from app.models.projects import (
    ProjectCreateRequest, ProjectUpdateRequest, BulkDeleteRequest,
    ProjectResponse, ProjectListResponse, BulkDeleteResponse,
)
from app.models.scans import ScanRequest, ScanResponse
from app.models.teams import ConnectGithubRequest, BranchFilesResponse, FileContentResponse, GithubAuthorizeResponse
from app.services.projects import project_service, project_github_service
from app.services.scans.scan_storage_service import (
    create_scan_record,
    create_failed_scan_record,
    save_vulnerabilities,
    save_report_artifact,
)
from app.services.scans import scanner_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Core project CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=ProjectListResponse)
async def list_projects(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return project_service.list_user_projects(current_user.id, supabase)


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreateRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return project_service.create_project(body, current_user.id, supabase)


@router.delete("/bulk-delete", response_model=BulkDeleteResponse)  # MUST come before /{project_id}
async def bulk_delete_projects(
    body: BulkDeleteRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return project_service.bulk_delete_projects(body.ids, current_user.id, supabase)


# /github/callback MUST come before /{project_id} — the literal path would
# otherwise be captured as project_id="github".
@router.get("/github/callback")
async def github_callback(
    installation_id: int | None = None,
    setup_action: str | None = None,
    state: str | None = None,
    code: str | None = None,
    supabase: Client = Depends(get_supabase),
):
    """
    Step 2 of the OAuth flow — GitHub redirects here.
    Routes project callback based on the state prefix "project:…".
    """
    return await project_github_service.process_github_callback(
        installation_id, state, supabase
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return project_service.get_project_by_id(project_id, current_user.id, supabase)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    body: ProjectUpdateRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return project_service.update_project(project_id, body, current_user.id, supabase)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    project_service.delete_project(project_id, current_user.id, supabase)


# ---------------------------------------------------------------------------
# GitHub integration — OAuth / GitHub App flow (mirrors teams router)
# ---------------------------------------------------------------------------

@router.get("/{project_id}/github/authorize", response_model=GithubAuthorizeResponse)
async def github_authorize(
    project_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Step 1 of the OAuth flow.
    Returns the GitHub App installation URL to redirect the user to.
    """
    return project_github_service.generate_github_authorize_url(
        project_id, current_user.id, supabase
    )


@router.get("/{project_id}/github/repos")
async def list_github_repos(
    project_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Step 3 of the OAuth flow.
    Lists repositories accessible via the stored installation token.
    """
    return await project_github_service.fetch_installation_repos(
        project_id, current_user.id, supabase
    )


@router.post("/{project_id}/github/select-repo", response_model=ProjectResponse)
async def select_github_repo(
    project_id: str,
    body: dict,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Step 4 of the OAuth flow.
    Connects the selected repo to the project and fetches branches via
    the installation token (no PAT needed).
    """
    return await project_github_service.select_installation_repo(
        project_id,
        body.get("repo_full_name", "").strip(),
        body.get("repo_url", "").strip(),
        current_user.id,
        supabase,
    )


@router.post("/{project_id}/github/sync-branches", response_model=ProjectResponse)
async def sync_github_branches(
    project_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Re-syncs branches for the connected repository using the stored
    installation token. No PAT required.
    """
    return await project_github_service.sync_branches(
        project_id, current_user.id, supabase
    )


# ---------------------------------------------------------------------------
# GitHub integration — legacy PAT-based connect/refresh
# ---------------------------------------------------------------------------

@router.post("/{project_id}/github", response_model=ProjectResponse)
async def connect_github(
    project_id: str,
    body: ConnectGithubRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Connect a GitHub repository to a personal project using a PAT.
    Validates the repo and PAT with GitHub, fetches all branches,
    and persists both to the projects table.
    The PAT is used once and never stored.
    """
    return await project_github_service.connect_github_repo(
        project_id, body.repo_url, body.pat, current_user.id, supabase
    )


@router.post("/{project_id}/github/refresh", response_model=ProjectResponse)
async def refresh_github_branches(
    project_id: str,
    body: ConnectGithubRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Re-fetch the branch list for the project's connected GitHub repository.
    Accepts an updated repo_url or PAT if they have changed.
    """
    return await project_github_service.refresh_branches(
        project_id, body.repo_url, body.pat, current_user.id, supabase
    )


# NOTE: /files/content MUST be registered before /files so FastAPI doesn't
# treat "content" as a path segment matched by the {branch:path} wildcard.
@router.get("/{project_id}/branches/{branch:path}/files/content", response_model=FileContentResponse)
async def get_file_content(
    project_id: str,
    branch: str,
    path: str = Query(..., description="Repo-relative file path, e.g. src/main.c"),
    pat: str | None = Query(None, description="PAT — only required if GitHub App not installed"),
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Fetch and decode the content of a single file from a branch.
    Prefers installation token (no PAT); falls back to PAT if supplied.
    """
    if pat:
        return await project_github_service.fetch_file_content(
            project_id, branch, path, pat, current_user.id, supabase
        )
    return await project_github_service.fetch_file_content_oauth(
        project_id, branch, path, current_user.id, supabase
    )


@router.get("/{project_id}/branches/{branch:path}/files", response_model=BranchFilesResponse)
async def get_branch_files(
    project_id: str,
    branch: str,
    pat: str | None = Query(None, description="PAT — only required if GitHub App not installed"),
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Return the full recursive file tree for a branch.
    Prefers installation token (no PAT); falls back to PAT if supplied.
    """
    if pat:
        return await project_github_service.fetch_branch_files_with_pat(
            project_id, branch, pat, current_user.id, supabase
        )
    return await project_github_service.fetch_branch_files_oauth(
        project_id, branch, current_user.id, supabase
    )


# ---------------------------------------------------------------------------
# GitHub-based scan for personal projects
# ---------------------------------------------------------------------------

@router.post("/{project_id}/scans", response_model=ScanResponse)
async def start_project_scan(
    project_id: str,
    body: ScanRequest,
    pat: str | None = Query(None, description="PAT — only needed if GitHub App not installed"),
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Fetch selected files from GitHub and run the vulnerability scanner.
    Prefers the stored installation token (no PAT needed after OAuth connect).
    Falls back to PAT if supplied.
    """
    start_time = time.time()

    # Prefer installation token; fall back to PAT if supplied
    if pat:
        files_dict = await project_github_service.fetch_selected_code_with_pat(
            project_id,
            body.branch,
            body.selected_files,
            pat,
            current_user.id,
            supabase,
        )
    else:
        files_dict = await project_github_service.fetch_selected_code_oauth(
            project_id,
            body.branch,
            body.selected_files,
            current_user.id,
            supabase,
        )

    # Run the scanner (same pipeline used by team scans)
    try:
        result = await scanner_service.run_vulnerability_scanner(files_dict)
    except Exception as exc:
        duration = int(time.time() - start_time)
        create_failed_scan_record(
            supabase,
            current_user.id,
            project_id,
            {
                "project_name": body.project_name,
                "scan_type":    "github",
                "branch":       body.branch,
                "duration_secs": duration,
            },
            str(exc),
        )
        raise

    duration = int(time.time() - start_time)

    # Persist scan results
    try:
        scan_data = {
            **result,
            "project_name":  body.project_name,
            "scan_type":     "github",
            "branch":        body.branch,
            "duration_secs": duration,
        }
        scan_id = create_scan_record(supabase, current_user.id, project_id, scan_data)
        save_vulnerabilities(supabase, scan_id, result["vulnerabilities"])
        save_report_artifact(
            supabase, current_user.id, scan_id,
            {**scan_data, **result},
            result["vulnerabilities"],
        )
        result["scan_id"] = scan_id
    except Exception as exc:
        print(f"[projects/scans] Failed to save scan to DB: {exc}")
        result["scan_id"] = None

    return ScanResponse(**result)
