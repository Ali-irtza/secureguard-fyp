import io
import os
import time
import zipfile
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from supabase import Client

from app.dependencies import get_supabase, get_current_user
from app.models.scans import BranchFilesResponse, ScanRequest, ScanResponse, UploadScanRequest
from app.services.scans import scanner_service
from app.services.scans.scan_storage_service import (
    create_scan_record,
    create_failed_scan_record,
    save_vulnerabilities,
    save_report_artifact,
    get_scans_for_user,
    get_scan_with_vulnerabilities,
)
from app.services.scans.report_storage_service import load_pdf_from_zip

router = APIRouter()

C_CPP_EXTENSIONS = {".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hxx"}


async def _extract_upload_files(files: list[UploadFile]) -> dict[str, str]:
    extracted: dict[str, str] = {}
    rejected: list[str] = []

    for upload in files:
        filename = os.path.basename(upload.filename or "").strip()
        if not filename:
            continue
        content = await upload.read()
        ext = os.path.splitext(filename)[1].lower()

        if ext == ".zip":
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as archive:
                    for entry in archive.infolist():
                        if entry.is_dir():
                            continue
                        inner_name = entry.filename.replace("\\", "/")
                        inner_ext = os.path.splitext(inner_name)[1].lower()
                        if inner_ext not in C_CPP_EXTENSIONS:
                            rejected.append(inner_name)
                            continue
                        extracted[inner_name] = archive.read(entry).decode("utf-8", errors="replace")
            except zipfile.BadZipFile:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid ZIP archive: {filename}",
                )
            continue

        if ext not in C_CPP_EXTENSIONS:
            rejected.append(filename)
            continue
        extracted[filename] = content.decode("utf-8", errors="replace")

    if not extracted:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No C or C++ source files were found. Upload .c, .h, .cpp, .cc, .cxx, .hpp, .hxx, or a ZIP containing those files.",
        )

    return extracted

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
    try:
        result = await scanner_service.run_vulnerability_scanner(files_dict)
    except Exception as exc:
        duration = int(time.time() - start_time)
        create_failed_scan_record(
            supabase,
            current_user.id,
            body.project_id,
            {"project_name": body.project_name, "scan_type": "github", "branch": body.branch, "duration_secs": duration},
            str(exc),
        )
        raise
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
        save_report_artifact(supabase, current_user.id, scan_id, {**scan_data, **result}, result["vulnerabilities"])
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
    try:
        result = await scanner_service.run_vulnerability_scanner(files_dict)
    except Exception as exc:
        duration = int(time.time() - start_time)
        create_failed_scan_record(
            supabase,
            current_user.id,
            body.project_id,
            {"project_name": body.project_name, "scan_type": "upload", "file_name": body.filename, "duration_secs": duration},
            str(exc),
        )
        raise
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
        save_report_artifact(supabase, current_user.id, scan_id, {**scan_data, **result}, result["vulnerabilities"])
        result["scan_id"] = scan_id
    except Exception as e:
        print(f"[scans] Failed to save scan to DB: {e}")
        result["scan_id"] = None

    return ScanResponse(**result)


@router.post("/scan/upload-files", response_model=ScanResponse)
async def scan_uploaded_files(
    files: list[UploadFile] = File(...),
    project_id: str = Form(""),
    project_name: str = Form(""),
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Scans uploaded C/C++ files or ZIP archives.
    ZIP archives are unpacked in memory; only C/C++ files are scanned.
    """
    start_time = time.time()
    files_dict = await _extract_upload_files(files)
    try:
        result = await scanner_service.run_vulnerability_scanner(files_dict)
    except Exception as exc:
        duration = int(time.time() - start_time)
        create_failed_scan_record(
            supabase,
            current_user.id,
            project_id,
            {"project_name": project_name, "scan_type": "upload", "file_name": ", ".join(files_dict.keys())[:500], "duration_secs": duration},
            str(exc),
        )
        raise
    duration = int(time.time() - start_time)

    try:
        scan_data = {
            **result,
            "project_name": project_name,
            "scan_type": "upload",
            "file_name": ", ".join(files_dict.keys())[:500],
            "duration_secs": duration,
        }
        scan_id = create_scan_record(supabase, current_user.id, project_id, scan_data)
        save_vulnerabilities(supabase, scan_id, result["vulnerabilities"])
        save_report_artifact(supabase, current_user.id, scan_id, {**scan_data, **result}, result["vulnerabilities"])
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


@router.get("/scans/{scan_id}/report-pdf")
async def get_scan_report_pdf(
    scan_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    scan = get_scan_with_vulnerabilities(supabase, scan_id, current_user.id)["scan"]
    storage_path = scan.get("report_storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="Report artifact is not available or has expired.")
    pdf_bytes = load_pdf_from_zip(supabase, storage_path)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="secureguard-report-{scan_id}.pdf"'},
    )
