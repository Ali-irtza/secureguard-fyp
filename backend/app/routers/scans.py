from fastapi import APIRouter, Depends
from supabase import Client

from app.dependencies import get_supabase, get_current_user
from app.models.scans import BranchFilesResponse, ScanRequest, ScanResponse
from app.services.scans import scanner_service

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
    Fetches the requested files from GitHub in-memory and passes them to the vulnerability scanner.
    """
    # 1. Fetch code in memory using the smart hybrid approach
    files_dict = await scanner_service.fetch_selected_code_hybrid(
        team_id, 
        body.branch, 
        body.selected_files, 
        current_user.id, 
        supabase
    )
    
    # 2. Pass the in-memory files to the scanner model
    result = scanner_service.dummy_vulnerability_scanner(files_dict)
    
    return ScanResponse(**result)
