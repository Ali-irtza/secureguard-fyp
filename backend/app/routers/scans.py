import io
import json
import io
import os
import re
import time
import zipfile
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import StreamingResponse
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
    list_reports_for_user,
    create_manual_report,
    get_report_for_user,
    delete_report_scan_for_user,
)
from app.services.scans.report_storage_service import load_pdf_from_zip, load_report_from_zip
from app.services.project_files.file_service import save_scanned_sources_zip

router = APIRouter()

C_CPP_EXTENSIONS = {".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hxx"}
NO_SOURCE_FILES_MESSAGE = (
    "This ZIP does not contain any C or C++ source files. "
    "Please upload a ZIP with .c, .cpp, .h, .hpp, .cc, .cxx, or .hxx files."
)


def _normalize_source_newlines(source_code: str) -> str:
    return re.sub(r"\r+\n", "\n", source_code).replace("\r", "\n")


def _suspicious_filename_message(filename: str, *, in_zip: bool = False) -> str:
    location = " inside the ZIP" if in_zip else ""
    upload_target = " and upload the ZIP again" if in_zip else " and upload it again"
    return f"Suspicious file name found{location}: {filename}. Rename the file{upload_target}."


def _normalize_safe_upload_path(filename: str) -> str:
    normalized = (filename or "").replace("\\", "/").strip().lstrip("/")
    parts = normalized.split("/")
    if (
        not normalized
        or normalized.startswith("../")
        or "/../" in normalized
        or normalized.endswith("/..")
        or normalized.startswith("./")
        or "/./" in normalized
        or normalized.endswith("/.")
        or any(part == "" for part in parts)
        or (len(normalized) > 1 and normalized[1] == ":")
        or any(ord(char) < 32 for char in normalized)
    ):
        raise ValueError(filename)
    return normalized


async def _extract_upload_files(files: list[UploadFile]) -> dict[str, str]:
    extracted: dict[str, str] = {}
    rejected: list[str] = []

    for upload in files:
        raw_filename = (upload.filename or "").strip()
        try:
            filename = _normalize_safe_upload_path(raw_filename)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=_suspicious_filename_message(raw_filename or "unnamed file"),
            )
        content = await upload.read()
        ext = os.path.splitext(filename)[1].lower()

        if ext == ".zip":
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as archive:
                    for entry in archive.infolist():
                        if entry.is_dir():
                            continue
                        try:
                            inner_name = _normalize_safe_upload_path(entry.filename)
                        except ValueError:
                            raise HTTPException(
                                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail=_suspicious_filename_message(entry.filename, in_zip=True),
                            )
                        inner_ext = os.path.splitext(inner_name)[1].lower()
                        if inner_ext not in C_CPP_EXTENSIONS:
                            rejected.append(inner_name)
                            continue
                        key = inner_name
                        duplicate_index = 2
                        while key in extracted:
                            stem, suffix = os.path.splitext(inner_name)
                            key = f"{stem}-{duplicate_index}{suffix}"
                            duplicate_index += 1
                        extracted[key] = _normalize_source_newlines(
                            archive.read(entry).decode("utf-8", errors="replace")
                        )
            except zipfile.BadZipFile:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid ZIP archive: {filename}",
                )
            continue

        if ext not in C_CPP_EXTENSIONS:
            rejected.append(filename)
            continue
        extracted[filename] = _normalize_source_newlines(content.decode("utf-8", errors="replace"))

    if not extracted:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=NO_SOURCE_FILES_MESSAGE,
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
    except HTTPException as exc:
        if exc.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY:
            raise
        duration = int(time.time() - start_time)
        create_failed_scan_record(
            supabase,
            current_user.id,
            body.project_id,
            {"project_name": body.project_name, "scan_type": "github", "branch": body.branch, "duration_secs": duration},
            str(exc.detail),
        )
        raise
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
    try:
        filename = _normalize_safe_upload_path(body.filename)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_suspicious_filename_message(body.filename or "unnamed file"),
        )
    files_dict = {filename: body.source_code}
    save_scanned_sources_zip(body.project_id, current_user.id, files_dict, supabase)
    try:
        result = await scanner_service.run_vulnerability_scanner(files_dict)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY:
            raise
        duration = int(time.time() - start_time)
        create_failed_scan_record(
            supabase,
            current_user.id,
            body.project_id,
            {"project_name": body.project_name, "scan_type": "upload", "file_name": filename, "duration_secs": duration},
            str(exc.detail),
        )
        raise
    except Exception as exc:
        duration = int(time.time() - start_time)
        create_failed_scan_record(
            supabase,
            current_user.id,
            body.project_id,
            {"project_name": body.project_name, "scan_type": "upload", "file_name": filename, "duration_secs": duration},
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
            "file_name": filename,
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
    save_scanned_sources_zip(project_id, current_user.id, files_dict, supabase)
    try:
        result = await scanner_service.run_vulnerability_scanner(files_dict)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY:
            raise
        duration = int(time.time() - start_time)
        create_failed_scan_record(
            supabase,
            current_user.id,
            project_id,
            {"project_name": project_name, "scan_type": "upload", "file_name": ", ".join(files_dict.keys())[:500], "duration_secs": duration},
            str(exc.detail),
        )
        raise
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


@router.post("/scan/upload-files/stream")
async def scan_uploaded_files_stream(
    files: list[UploadFile] = File(...),
    project_id: str = Form(""),
    project_name: str = Form(""),
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Streams uploaded C/C++ scan progress as newline-delimited JSON.
    Each line is one event object; the final scan_result event includes the persisted scan_id.
    """
    start_time = time.time()
    files_dict = await _extract_upload_files(files)
    save_scanned_sources_zip(project_id, current_user.id, files_dict, supabase)

    def line(event: dict) -> str:
        return json.dumps(event, ensure_ascii=False) + "\n"

    def event_stream():
        final_result = None
        for event in scanner_service.iter_vulnerability_scanner_events(files_dict):
            if event.get("event") == "error":
                status_code = int(event.get("status_code") or status.HTTP_500_INTERNAL_SERVER_ERROR)
                if status_code != status.HTTP_422_UNPROCESSABLE_ENTITY:
                    duration = int(time.time() - start_time)
                    create_failed_scan_record(
                        supabase,
                        current_user.id,
                        project_id,
                        {
                            "project_name": project_name,
                            "scan_type": "upload",
                            "file_name": ", ".join(files_dict.keys())[:500],
                            "duration_secs": duration,
                        },
                        event.get("message", "Scan failed"),
                    )
                yield line(event)
                return
            if event.get("event") == "scan_result":
                final_result = event["result"]
                duration = int(time.time() - start_time)
                try:
                    scan_data = {
                        **final_result,
                        "project_name": project_name,
                        "scan_type": "upload",
                        "file_name": ", ".join(files_dict.keys())[:500],
                        "duration_secs": duration,
                    }
                    scan_id = create_scan_record(supabase, current_user.id, project_id, scan_data)
                    save_vulnerabilities(supabase, scan_id, final_result["vulnerabilities"])
                    save_report_artifact(supabase, current_user.id, scan_id, {**scan_data, **final_result}, final_result["vulnerabilities"])
                    final_result["scan_id"] = scan_id
                except Exception as exc:
                    print(f"[scans] Failed to save streamed scan to DB: {exc}")
                    final_result["scan_id"] = None
                yield line({"event": "scan_result", "result": final_result})
                return
            yield line(event)

        if final_result is None:
            yield line({"event": "error", "message": "Scan ended before a report was produced."})

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

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


@router.get("/reports", response_model=list[dict])
async def get_reports(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Returns generated report metadata for the authenticated user."""
    return list_reports_for_user(supabase, current_user.id)


@router.post("/reports", response_model=list[dict])
async def generate_report(
    body: dict = Body(...),
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Generate PDF, CSV, or both from the latest completed scan for a project."""
    report_type = body.get("report_type", "full")
    if report_type != "full":
        raise HTTPException(status_code=422, detail="Team reports are not available yet.")

    project_id = str(body.get("project_id") or "").strip()
    if not project_id:
        raise HTTPException(status_code=422, detail="Select a project before generating a report.")

    report_format = str(body.get("format") or "pdf").lower()
    if report_format not in {"pdf", "csv", "both"}:
        raise HTTPException(status_code=422, detail="Report format must be pdf, csv, or both.")

    try:
        return create_manual_report(
            supabase,
            current_user.id,
            project_id,
            report_format,
            body.get("start_date"),
            body.get("end_date"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/reports/{report_id}/download")
async def download_report(
    report_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Download a stored report as its actual PDF/CSV file, not the internal ZIP."""
    try:
        report = get_report_for_user(supabase, report_id, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    storage_path = report.get("file_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="Report artifact is not available or has expired.")
    report_format = report.get("format") or "pdf"
    content, filename, media_type = load_report_from_zip(supabase, storage_path, report_format)
    extension = "csv" if report_format == "csv" else "pdf"
    safe_name = f"secureguard-{report.get('name') or 'report'}-{report_id}.{extension}".replace("/", "-").replace("\\", "-")
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.delete("/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Delete the report's linked scan so report, scan history, dashboard, and vulnerabilities stay synced."""
    try:
        delete_report_scan_for_user(supabase, report_id, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
