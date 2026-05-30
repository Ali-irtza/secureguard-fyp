import time
from fastapi import APIRouter, Depends
from supabase import Client

from app.dependencies import get_supabase, get_current_user
from app.models.scans import BranchFilesResponse, ScanRequest, ScanResponse, UploadScanRequest
from app.services.scans import scanner_service
from app.services.scans.scan_storage_service import (
    create_scan_record,
    save_vulnerabilities,
    get_scans_for_user,
    get_scan_with_vulnerabilities,
)

router = APIRouter()

@router.get("/{team_id}/github/files", response_model=BranchFilesResponse)
async def get_branch_files(
    team_id: str,
    branch: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns a list of all C/C++ file paths for a given branch in the connected GitHub repository.
    """
    files = await scanner_service.fetch_branch_files(team_id, branch, current_user.id, supabase)
    return BranchFilesResponse(files=files)

@router.post("/{team_id}/scans", response_model=ScanResponse)
async def start_scan(
    team_id: str,
    body: ScanRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Fetches files from GitHub and scans them, saving results to Supabase.
    """
    start_time = time.time()
    files_dict = await scanner_service.fetch_selected_code_hybrid(
        team_id,
        body.branch,
        body.selected_files,
        current_user.id,
        supabase
    )
    result = await scanner_service.run_vulnerability_scanner(files_dict)
    duration = int(time.time() - start_time)

    # Save to database
    try:
        scan_data = {
            **result,
            "project_name": body.project_name,
            "scan_type": "github",
            "branch": body.branch,
            "duration_secs": duration,
        }
        scan_id = create_scan_record(supabase, current_user.id, body.project_id, scan_data)
        save_vulnerabilities(supabase, scan_id, result["vulnerabilities"])
        result["scan_id"] = scan_id
    except Exception as e:
        print(f"[scans] Failed to save scan to DB: {e}")
        result["scan_id"] = None

    return ScanResponse(**result)

@router.post("/scan/upload", response_model=ScanResponse)
async def scan_uploaded_file(
    body: UploadScanRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Scans a single uploaded file and saves results to Supabase.
    """
    start_time = time.time()
    files_dict = {body.filename: body.source_code}
    result = await scanner_service.run_vulnerability_scanner(files_dict)
    duration = int(time.time() - start_time)

    # Save to database
    try:
        scan_data = {
            **result,
            "project_name": body.project_name,
            "scan_type": "upload",
            "file_name": body.filename,
            "duration_secs": duration,
        }
        scan_id = create_scan_record(supabase, current_user.id, body.project_id, scan_data)
        save_vulnerabilities(supabase, scan_id, result["vulnerabilities"])
        result["scan_id"] = scan_id
    except Exception as e:
        print(f"[scans] Failed to save scan to DB: {e}")
        result["scan_id"] = None

    return ScanResponse(**result)

@router.get("/scans/history", response_model=list[dict])
async def get_scan_history(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns all past scans for the current authenticated user.
    """
    scans = get_scans_for_user(supabase, current_user.id)
    return scans


@router.get("/scans/{scan_id}", response_model=dict)
async def get_scan_detail(
    scan_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns a single scan with its full vulnerability list.
    """
    scan = get_scan_with_vulnerabilities(supabase, scan_id, current_user.id)
    return scan
