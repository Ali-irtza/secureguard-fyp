from pydantic import BaseModel, Field
from typing import List

class BranchFilesResponse(BaseModel):
    """
    Response model for GET /teams/{team_id}/github/files?branch={branch_name}
    Returns a list of C/C++ file paths available in the branch.
    """
    files: List[str]

class ScanRequest(BaseModel):
    """
    Request model for POST /teams/{team_id}/scans
    The client provides the branch name and the exact files to scan.
    """
    branch: str = Field(..., description="The name of the branch to scan.")
    selected_files: List[str] = Field(..., description="List of file paths selected by the user to scan.")

class ScanResponse(BaseModel):
    """
    Response model for POST /teams/{team_id}/scans
    Currently returns a dummy result summarizing what was analyzed.
    """
    status: str
    message: str
    files_analyzed: int
    total_lines_analyzed: int
