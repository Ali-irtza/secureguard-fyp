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
    project_id: str = Field(..., description="Project ID this scan belongs to")
    project_name: str = Field(default="", description="Display name for the project")

class UploadScanRequest(BaseModel):
    """Request model for POST /scan/upload — direct source code submission."""
    filename: str = Field(..., description="Original filename e.g. main.c")
    source_code: str = Field(..., description="Full source code content as string")
    project_id: str = Field(..., description="Project ID this scan belongs to")
    project_name: str = Field(default="", description="Display name for the project")


class ScanFileResult(BaseModel):
    filename: str
    language: str
    corrected_code: str = "None"
    static_findings: str = ""
    corrected_code_is_clean: bool = False
    chunk_outputs: list[dict] = []

class VulnerabilityDetail(BaseModel):
    """A single vulnerability found in a file."""
    cwe_id: str
    cwe_name: str
    severity: str
    line_number: int = 0
    absolute_line: int = 0
    description: str
    fix_suggestion: str
    function_name: str = ""
    file_path: str = ""
    location: str = ""
    affected_code: str = ""


class FileSummary(BaseModel):
    """Per-file scan summary."""
    file_path: str
    chunks_scanned: int
    vulnerabilities_found: int
    risk_level: str


class ScanResponse(BaseModel):
    """
    Response model for POST /teams/{team_id}/scans
    Returns full AI vulnerability scan results.
    """
    status: str
    total_vulnerabilities: int
    overall_risk_level: str
    overall_risk_score: int
    files_analyzed: int
    total_chunks_scanned: int
    files_summary: List[FileSummary]
    vulnerabilities: List[VulnerabilityDetail]
    corrected_code: str = "None"
    files: List[ScanFileResult] = []
    chunk_outputs: list[dict] = []
    scan_id: str | None = None
