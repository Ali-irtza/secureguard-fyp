from supabase import Client
import base64
import time
import random
import io
import os
import re
import zipfile
import zlib

import httpcore
import httpx
from typing import Dict, List
from datetime import datetime, timezone
from app.services.scans.report_storage_service import REPORT_BUCKET, create_zipped_pdf_report, create_zipped_report, cleanup_expired_reports
from app.services.project_files.file_service import STORAGE_BUCKET as PROJECT_FILES_BUCKET


RETRYABLE_SUPABASE_EXCEPTIONS = (
    httpx.RemoteProtocolError,
    httpcore.RemoteProtocolError,
    httpx.ConnectError,
    httpx.ReadError,
    httpx.TimeoutException,
)


def _retry_supabase_request(operation_name: str, action):
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            return action()
        except RETRYABLE_SUPABASE_EXCEPTIONS as exc:
            last_exc = exc
            if attempt == 2:
                print(f"[supabase] {operation_name} failed after retries: {exc}")
                raise
            delay = 0.35 * (2 ** attempt) + random.uniform(0.0, 0.15)
            print(f"[supabase] {operation_name} retry {attempt + 1}/3 after {exc.__class__.__name__}")
            time.sleep(delay)
    if last_exc:
        raise last_exc
    raise RuntimeError(f"{operation_name} failed without raising an exception")


def _normalized_chunk_outputs(scan_data: dict) -> list[dict]:
    chunks = scan_data.get("chunk_outputs") or []
    if chunks:
        return chunks

    normalized: list[dict] = []
    for file_item in scan_data.get("files") or []:
        file_path = file_item.get("filename") or file_item.get("file_path") or scan_data.get("file_name") or "source.c"
        for chunk in file_item.get("chunk_outputs") or []:
            normalized.append({**chunk, "file_path": chunk.get("file_path") or file_path})
    return normalized


def _corrected_code_from_scan_data(scan_data: dict) -> str | None:
    corrected = scan_data.get("corrected_code")
    if corrected and corrected != "None":
        return corrected

    corrected_files = [
        str(file_item.get("corrected_code") or "")
        for file_item in scan_data.get("files") or []
        if file_item.get("corrected_code") and file_item.get("corrected_code") != "None"
    ]
    return "\n\n".join(corrected_files) if corrected_files else corrected


def create_scan_record(
    supabase: Client, user_id: str, project_id: str, scan_data: dict
) -> str:
    """Insert a new row into the scans table and return the new scan's id."""
    result = _retry_supabase_request(
        "create_scan_record",
        lambda: (
            supabase.table("scans")
            .insert(
                {
                    "project_id": project_id,
                    "user_id": user_id,
                    "status": "completed",
                    "project_name": scan_data.get("project_name", ""),
                    "scan_type": scan_data.get("scan_type", "upload"),
                    "file_name": scan_data.get("file_name", ""),
                    "file_path": scan_data.get("file_path", ""),
                    "branch": scan_data.get("branch", ""),
                    "risk_level": scan_data.get("overall_risk_level", ""),
                    "risk_score": scan_data.get("overall_risk_score", 0),
                    "total_vulns": scan_data.get("total_vulnerabilities", 0),
                    "files_scanned": scan_data.get("files_analyzed", 0),
                    "duration_secs": scan_data.get("duration_secs", 0),
                    "report_storage_path": scan_data.get("report_storage_path"),
                    "report_expires_at": scan_data.get("report_expires_at"),
                    "corrected_code": _corrected_code_from_scan_data(scan_data),
                    "chunk_outputs": _normalized_chunk_outputs(scan_data),
                    "started_at": scan_data.get(
                        "started_at", datetime.now(timezone.utc).isoformat()
                    ),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
        ),
    )
    return result.data[0]["id"]


def create_failed_scan_record(
    supabase: Client,
    user_id: str,
    project_id: str,
    scan_data: dict,
    error_message: str,
) -> str | None:
    """Persist a failed scan when a model run does not complete."""
    if not project_id:
        return None
    result = _retry_supabase_request(
        "create_failed_scan_record",
        lambda: (
            supabase.table("scans")
            .insert(
                {
                    "project_id": project_id,
                    "user_id": user_id,
                    "status": "failed",
                    "project_name": scan_data.get("project_name", ""),
                    "scan_type": scan_data.get("scan_type", "upload"),
                    "file_name": scan_data.get("file_name", ""),
                    "branch": scan_data.get("branch", ""),
                    "risk_level": "Failed",
                    "risk_score": 0,
                    "total_vulns": 0,
                    "files_scanned": 0,
                    "duration_secs": scan_data.get("duration_secs", 0),
                    "error_message": error_message[:1000],
                    "started_at": scan_data.get("started_at", datetime.now(timezone.utc).isoformat()),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .execute()
        ),
    )
    return result.data[0]["id"] if result.data else None


def save_vulnerabilities(
    supabase: Client, scan_id: str, vulnerabilities: List[Dict]
) -> None:
    """Batch-insert all vulnerabilities for a scan into the vulnerabilities table."""
    if not vulnerabilities:
        return

    rows = [
        {
            "scan_id": scan_id,
            "severity": vuln.get("severity", "medium").lower(),
            "type": vuln.get("cwe_name", ""),
            "cwe_id": vuln.get("cwe_id", ""),
            "cwe_name": vuln.get("cwe_name", ""),
            "line_number": vuln.get("line_number", 0),
            "absolute_line": vuln.get("absolute_line", 0),
            "description": vuln.get("description", ""),
            "fix_suggestion": vuln.get("fix_suggestion", ""),
            "function_name": vuln.get("function_name", ""),
            "file_path": vuln.get("file_path", ""),
            "code_snippet": vuln.get("affected_code", ""),
            "location": vuln.get("location", ""),
        }
        for vuln in vulnerabilities
    ]

    _retry_supabase_request(
        "save_vulnerabilities",
        lambda: supabase.table("vulnerabilities").insert(rows).execute(),
    )


def save_report_artifact(
    supabase: Client,
    user_id: str,
    scan_id: str,
    scan_data: dict,
    vulnerabilities: List[Dict],
) -> None:
    """Create a zipped PDF report in storage and a report metadata row."""
    artifact = create_zipped_pdf_report(supabase, user_id, scan_id, scan_data, vulnerabilities)
    _retry_supabase_request(
        "save_report_artifact.scans_update",
        lambda: supabase.table("scans").update(
            {
                "report_storage_path": artifact["path"],
                "report_expires_at": artifact["expires_at"],
            }
        ).eq("id", scan_id).execute(),
    )
    _retry_supabase_request(
        "save_report_artifact.reports_insert",
        lambda: supabase.table("reports").insert(
            {
                "scan_id": scan_id,
                "user_id": user_id,
                "name": f"{scan_data.get('project_name') or 'Scan'} Report",
                "format": "pdf",
                "status": "completed",
                "file_path": artifact["path"],
                "expires_at": artifact["expires_at"],
            }
        ).execute(),
    )


def get_scans_for_user(
    supabase: Client, user_id: str, limit: int = 50
) -> List[Dict]:
    """Fetch recent scans for a user, ordered by creation date descending."""
    cleanup_expired_reports(supabase)
    result = _retry_supabase_request(
        "get_scans_for_user.scans_select",
        lambda: (
            supabase.table("scans")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        ),
    )
    scans = result.data or []
    scan_ids = [scan["id"] for scan in scans]
    if not scan_ids:
        return scans

    vulns_result = _retry_supabase_request(
        "get_scans_for_user.vulnerabilities_select",
        lambda: (
            supabase.table("vulnerabilities")
            .select("scan_id,severity,cwe_id,cwe_name,type,line_number,file_path,description,created_at")
            .in_("scan_id", scan_ids)
            .execute()
        ),
    )
    severity_counts: dict[str, dict[str, int]] = {}
    critical_findings: dict[str, list[dict]] = {}
    for vuln in vulns_result.data or []:
        scan_id = vuln["scan_id"]
        severity = str(vuln.get("severity") or "low").lower()
        severity_counts.setdefault(scan_id, {"critical": 0, "high": 0, "medium": 0, "low": 0})
        severity_counts[scan_id][severity if severity in severity_counts[scan_id] else "low"] += 1
        if severity == "critical":
            critical_findings.setdefault(scan_id, []).append(vuln)

    for scan in scans:
        scan["severity_counts"] = severity_counts.get(scan["id"], {"critical": 0, "high": 0, "medium": 0, "low": 0})
        scan["critical_findings"] = critical_findings.get(scan["id"], [])
    return scans


def list_reports_for_user(supabase: Client, user_id: str) -> List[Dict]:
    """Fetch report rows with their owning scan data for the reports page."""
    cleanup_expired_reports(supabase)
    scans_result = _retry_supabase_request(
        "list_reports_for_user.scans_select",
        lambda: (
            supabase.table("scans")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "completed")
            .order("created_at", desc=True)
            .execute()
        ),
    )
    completed_scans = scans_result.data or []
    existing_result = _retry_supabase_request(
        "list_reports_for_user.reports_select_existing",
        lambda: (
            supabase.table("reports")
            .select("id,scan_id")
            .eq("user_id", user_id)
            .execute()
        ),
    )
    scans_with_reports = {row.get("scan_id") for row in existing_result.data or [] if row.get("scan_id")}

    for scan in completed_scans:
        scan_id = scan.get("id")
        if not scan_id or scan_id in scans_with_reports:
            continue
        try:
            vulns_result = _retry_supabase_request(
                "list_reports_for_user.vulnerabilities_select",
                lambda: (
                    supabase.table("vulnerabilities")
                    .select("*")
                    .eq("scan_id", scan_id)
                    .execute()
                ),
            )
            save_report_artifact(supabase, user_id, scan_id, scan, vulns_result.data or [])
            scans_with_reports.add(scan_id)
        except Exception as exc:
            print(f"[reports] Failed to backfill report for scan {scan_id}: {exc}")

    result = (
        supabase.table("reports")
        .select("*,scans(id,project_id,project_name,scan_type,file_name,risk_level,total_vulns,files_scanned,created_at,completed_at,report_storage_path,report_expires_at)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def create_manual_report(
    supabase: Client,
    user_id: str,
    project_id: str,
    report_format: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> List[Dict]:
    """Create one or two downloadable report artifacts from the latest matching completed scan."""
    query = (
        supabase.table("scans")
        .select("*")
        .eq("user_id", user_id)
        .eq("project_id", project_id)
        .eq("status", "completed")
        .order("completed_at", desc=True)
        .limit(1)
    )
    if start_date:
        query = query.gte("completed_at", start_date)
    if end_date:
        query = query.lte("completed_at", end_date)
    scan_result = query.execute()
    scans = scan_result.data or []
    if not scans:
        raise ValueError("No completed scans found for the selected project and date range.")

    scan = scans[0]
    vulns_result = (
        supabase.table("vulnerabilities")
        .select("*")
        .eq("scan_id", scan["id"])
        .execute()
    )
    vulnerabilities = vulns_result.data or []
    requested_formats = ["pdf", "csv"] if report_format == "both" else [report_format]
    created: List[Dict] = []
    for fmt in requested_formats:
        safe_format = "csv" if fmt == "csv" else "pdf"
        artifact = create_zipped_report(supabase, user_id, scan["id"], scan, vulnerabilities, safe_format)
        report = (
            supabase.table("reports")
            .insert(
                {
                    "scan_id": scan["id"],
                    "user_id": user_id,
                    "name": f"{scan.get('project_name') or 'Scan'} Full Scan Report",
                    "format": safe_format,
                    "status": "completed",
                    "file_path": artifact["path"],
                    "expires_at": artifact["expires_at"],
                }
            )
            .execute()
        )
        created.extend(report.data or [])
    return created


def get_report_for_user(supabase: Client, report_id: str, user_id: str) -> Dict:
    result = (
        supabase.table("reports")
        .select("*")
        .eq("id", report_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise ValueError("Report not found")
    return result.data


def delete_report_for_user(supabase: Client, report_id: str, user_id: str) -> str | None:
    """Delete one report artifact and metadata row. Returns linked scan id for UI refresh context."""
    report = get_report_for_user(supabase, report_id, user_id)
    storage_path = report.get("file_path")
    if storage_path:
        supabase.storage.from_(REPORT_BUCKET).remove([storage_path])
    supabase.table("reports").delete().eq("id", report_id).eq("user_id", user_id).execute()
    return report.get("scan_id")


def delete_report_scan_for_user(supabase: Client, report_id: str, user_id: str) -> str | None:
    """Delete a report's linked scan so reports, scan history, dashboard stats, and vulnerabilities stay in sync."""
    report = get_report_for_user(supabase, report_id, user_id)
    scan_id = report.get("scan_id")
    if not scan_id:
        delete_report_for_user(supabase, report_id, user_id)
        return None

    related_reports = (
        supabase.table("reports")
        .select("id,file_path")
        .eq("scan_id", scan_id)
        .eq("user_id", user_id)
        .execute()
    )
    paths = [row["file_path"] for row in related_reports.data or [] if row.get("file_path")]
    if paths:
        supabase.storage.from_(REPORT_BUCKET).remove(paths)

    supabase.table("reports").delete().eq("scan_id", scan_id).eq("user_id", user_id).execute()
    supabase.table("scans").delete().eq("id", scan_id).eq("user_id", user_id).execute()
    return scan_id


def get_scan_with_vulnerabilities(
    supabase: Client, scan_id: str, user_id: str
) -> Dict:
    """Fetch a scan if the user owns it or belongs to the scan's team project."""
    scan_result = (
        supabase.table("scans")
        .select("*")
        .eq("id", scan_id)
        .limit(1)
        .execute()
    )
    scan = (scan_result.data or [None])[0]

    if not scan:
        raise ValueError("Scan not found")

    scan_owner_id = scan.get("user_id")
    project_id = scan.get("project_id")
    if scan_owner_id != user_id:
        project_result = (
            supabase.table("projects")
            .select("team_id,type")
            .eq("id", project_id)
            .limit(1)
            .execute()
        )
        project = (project_result.data or [None])[0]
        team_id = project.get("team_id") if project else None
        if not team_id:
            raise ValueError("Scan not found")

        membership = (
            supabase.table("team_members")
            .select("id")
            .eq("team_id", team_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not membership.data:
            raise ValueError("Scan not found")

    vulns_result = (
        supabase.table("vulnerabilities")
        .select("*")
        .eq("scan_id", scan_id)
        .execute()
    )
    project_files_result = (
        supabase.table("project_files")
        .select("filename,storage_path")
        .eq("project_id", project_id)
        .eq("uploaded_by", scan_owner_id)
        .like("storage_path", f"{project_id}/scan-sources/%")
        .order("created_at", desc=True)
        .execute()
    )
    source_files: list[dict] = []
    scan_file_names = {
        name.strip()
        for name in str(scan.get("file_name") or "").split(",")
        if name.strip()
    }
    storage_paths: list[str] = []
    storage_groups: dict[str, set[str]] = {}
    for row in project_files_result.data or []:
        row_path = row.get("storage_path")
        row_name = row.get("filename")
        if row_path and row_name:
            storage_groups.setdefault(row_path, set()).add(row_name)
    for row_path, row_names in storage_groups.items():
        if scan_file_names and scan_file_names.issubset(row_names):
            storage_paths.append(row_path)
            break
    for row in project_files_result.data or []:
        row_path = row.get("storage_path")
        if row_path and row_path not in storage_paths:
            storage_paths.append(row_path)

    for storage_path in storage_paths:
        try:
            zipped = supabase.storage.from_(PROJECT_FILES_BUCKET).download(storage_path)
            with zipfile.ZipFile(io.BytesIO(zipped)) as archive:
                for name in archive.namelist():
                    if name.endswith("/"):
                        continue
                    source_files.append(
                        {
                            "filename": name,
                            "source_code": archive.read(name).decode("utf-8", errors="replace"),
                            "storage_path": storage_path,
                        }
                    )
            if source_files:
                break
        except Exception as exc:
            message = str(exc)
            if "cannot access local variable 'response'" not in message:
                print(f"[scans] Failed to load scanned source ZIP for scan {scan_id}: {message}")
            continue

    return {
        "scan": scan,
        "vulnerabilities": vulns_result.data,
        "source_files": source_files,
    }


def _safe_zip_path(path: str) -> str:
    normalized = (path or "source.c").replace("\\", "/").strip().lstrip("/")
    parts = [part for part in normalized.split("/") if part and part not in {".", ".."}]
    return "/".join(parts) or "source.c"


def _corrected_name_for(path: str) -> str:
    safe_path = _safe_zip_path(path)
    directory = os.path.dirname(safe_path).replace("\\", "/")
    basename = os.path.basename(safe_path)
    stem, ext = os.path.splitext(basename)
    corrected = f"{stem or 'source'}_corrected{ext or '.txt'}"
    return f"{directory}/{corrected}" if directory else corrected


def _add_unique_zip_entry(files: dict[str, bytes], name: str, content: str) -> None:
    safe_name = _safe_zip_path(name)
    candidate = safe_name
    index = 2
    while candidate in files:
        root, ext = os.path.splitext(safe_name)
        candidate = f"{root}-{index}{ext}"
        index += 1
    files[candidate] = content.encode("utf-8")


def _code_by_file_from_chunks(scan: dict) -> tuple[dict[str, str], dict[str, str]]:
    grouped: dict[str, list[dict]] = {}
    for chunk in scan.get("chunk_outputs") or []:
        file_path = chunk.get("file_path") or "source.c"
        grouped.setdefault(file_path, []).append(chunk)

    input_by_file: dict[str, str] = {}
    corrected_by_file: dict[str, str] = {}
    for file_path, chunks in grouped.items():
        sorted_chunks = sorted(chunks, key=lambda chunk: int(chunk.get("chunk_index") or 0))
        input_by_file[file_path] = "\n\n".join(
            str(chunk.get("code") or "") for chunk in sorted_chunks if chunk.get("code")
        ).strip()
        corrected = "\n\n".join(
            str(chunk.get("corrected_code") or "")
            for chunk in sorted_chunks
            if chunk.get("corrected_code") and chunk.get("corrected_code") not in {"None", "Pending..."}
        ).strip()
        if corrected:
            corrected_by_file[file_path] = corrected

    if not corrected_by_file and scan.get("corrected_code") and scan.get("corrected_code") != "None":
        corrected_by_file[scan.get("file_name") or "source.c"] = scan["corrected_code"]

    return input_by_file, corrected_by_file


def _code_zip_from_report_artifact(supabase: Client, storage_path: str | None) -> bytes | None:
    if not storage_path:
        return None
    try:
        report_zip = supabase.storage.from_(REPORT_BUCKET).download(storage_path)
        with zipfile.ZipFile(io.BytesIO(report_zip)) as archive:
            code_entries = [
                name for name in archive.namelist()
                if name.startswith("code/input/") or name.startswith("code/corrected/")
            ]
            has_input = any(name.startswith("code/input/") for name in code_entries)
            has_corrected = any(name.startswith("code/corrected/") for name in code_entries)
            if not has_input or not has_corrected:
                return None

            output = io.BytesIO()
            with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as code_zip:
                for name in code_entries:
                    code_zip.writestr(name.removeprefix("code/"), archive.read(name))
            return output.getvalue()
    except Exception as exc:
        print(f"[reports] Failed to load code bundle from report artifact: {exc}")
        return None


def _decode_pdf_stream(raw: bytes) -> bytes | None:
    candidates = [raw]
    try:
        ascii85 = raw[:-2] if raw.endswith(b"~>") else raw
        candidates.append(base64.a85decode(ascii85, adobe=False))
    except Exception:
        pass

    for candidate in candidates:
        try:
            return zlib.decompress(candidate)
        except Exception:
            continue
    return None


def _pdf_literal_to_text(value: bytes) -> str:
    output = []
    index = 0
    while index < len(value):
        char = value[index]
        if char != 92:
            output.append(chr(char))
            index += 1
            continue

        index += 1
        if index >= len(value):
            break
        escaped = value[index]
        mapping = {
            ord("n"): "\n",
            ord("r"): "\r",
            ord("t"): "\t",
            ord("b"): "\b",
            ord("f"): "\f",
            ord("("): "(",
            ord(")"): ")",
            ord("\\"): "\\",
        }
        if escaped in mapping:
            output.append(mapping[escaped])
            index += 1
            continue
        if 48 <= escaped <= 55:
            octal = bytes([escaped])
            index += 1
            for _ in range(2):
                if index < len(value) and 48 <= value[index] <= 55:
                    octal += bytes([value[index]])
                    index += 1
                else:
                    break
            output.append(chr(int(octal, 8)))
            continue
        output.append(chr(escaped))
        index += 1
    return "".join(output)


def _extract_pdf_text_operands(pdf_bytes: bytes) -> list[str]:
    texts: list[str] = []
    start = 0
    while True:
        stream_start = pdf_bytes.find(b"\nstream", start)
        if stream_start < 0:
            break
        stream_end = pdf_bytes.find(b"endstream", stream_start)
        if stream_end < 0:
            break
        raw = pdf_bytes[stream_start + len(b"\nstream"):stream_end].strip(b"\r\n")
        decoded = _decode_pdf_stream(raw)
        if decoded:
            for match in re.finditer(rb"\((?:\\.|[^\\)])*\)\s*Tj", decoded, re.S):
                literal = match.group(0).rsplit(b")", 1)[0][1:]
                text = _pdf_literal_to_text(literal).strip()
                if text:
                    texts.append(text)
        start = stream_end + len(b"endstream")
    return texts


def _code_by_file_from_report_pdf(pdf_bytes: bytes) -> tuple[dict[str, str], dict[str, str]]:
    input_by_file: dict[str, list[str]] = {}
    corrected_by_file: dict[str, list[str]] = {}
    current_file: str | None = None
    mode: str | None = None

    for text in _extract_pdf_text_operands(pdf_bytes):
        input_match = re.match(r"Input\s+\d+:\s+(.+)", text)
        if input_match:
            current_file = input_match.group(1).strip() or "source.c"
            input_by_file.setdefault(current_file, [])
            corrected_by_file.setdefault(current_file, [])
            mode = None
            continue

        if text == "Input Code":
            mode = "input"
            continue
        if text == "CWE Findings In This Input":
            mode = None
            continue
        if text == "Corrected Code":
            mode = "corrected"
            continue
        if text.startswith("Input ") and ":" in text:
            mode = None
            continue
        if text.startswith("Page ") or text.startswith("CONFIDENTIAL") or text == "SecureGuard":
            mode = None
            continue

        if current_file and mode in {"input", "corrected"}:
            if text.isdigit():
                continue
            target = input_by_file if mode == "input" else corrected_by_file
            target.setdefault(current_file, []).append(text)

    input_code = {path: "\n".join(lines).strip() for path, lines in input_by_file.items() if "\n".join(lines).strip()}
    corrected_code = {
        path: "\n".join(lines).strip()
        for path, lines in corrected_by_file.items()
        if "\n".join(lines).strip() and "No corrected code was returned" not in "\n".join(lines)
    }
    return input_code, corrected_code


def _code_zip_from_report_pdf(pdf_bytes: bytes, download_name: str) -> tuple[bytes, str] | None:
    input_by_file, corrected_by_file = _code_by_file_from_report_pdf(pdf_bytes)
    if not input_by_file or not corrected_by_file:
        return None

    zip_files: dict[str, bytes] = {}
    for file_path, input_code in input_by_file.items():
        filename = _safe_zip_path(file_path)
        _add_unique_zip_entry(zip_files, f"input/{filename}", input_code)
        corrected_code = (
            corrected_by_file.get(file_path)
            or corrected_by_file.get(filename)
            or corrected_by_file.get(os.path.basename(filename))
        )
        if corrected_code:
            _add_unique_zip_entry(zip_files, f"corrected/{_corrected_name_for(filename)}", corrected_code)

    if not any(name.startswith("corrected/") for name in zip_files):
        return None

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for filename, content in zip_files.items():
            archive.writestr(filename, content)
    return zip_buffer.getvalue(), download_name


def _code_zip_from_report_pdf_artifact(
    supabase: Client,
    storage_path: str | None,
    download_name: str,
) -> tuple[bytes, str] | None:
    if not storage_path:
        return None
    try:
        report_zip = supabase.storage.from_(REPORT_BUCKET).download(storage_path)
        with zipfile.ZipFile(io.BytesIO(report_zip)) as archive:
            pdf_entry = next((name for name in archive.namelist() if name.lower().endswith(".pdf")), None)
            if not pdf_entry:
                return None
            return _code_zip_from_report_pdf(archive.read(pdf_entry), download_name)
    except Exception as exc:
        print(f"[reports] Failed to recover code from report PDF: {exc}")
        return None


def build_code_zip_for_scan(supabase: Client, scan_id: str, user_id: str) -> tuple[bytes, str]:
    """Builds a ZIP with original scanned code and corrected code for a report scan."""
    detail = get_scan_with_vulnerabilities(supabase, scan_id, user_id)
    scan = detail["scan"]
    source_files = detail.get("source_files") or []
    input_by_file, corrected_by_file = _code_by_file_from_chunks(scan)
    corrected_lookup: dict[str, str] = {}
    for file_path, corrected_code in corrected_by_file.items():
        safe_file_path = _safe_zip_path(file_path)
        corrected_lookup[file_path] = corrected_code
        corrected_lookup[safe_file_path] = corrected_code
        corrected_lookup[os.path.basename(safe_file_path)] = corrected_code

    zip_files: dict[str, bytes] = {}
    source_paths = set()
    input_count = 0
    corrected_count = 0
    for file_path, input_code in input_by_file.items():
        filename = _safe_zip_path(file_path)
        source_paths.add(filename)
        if input_code:
            _add_unique_zip_entry(zip_files, f"input/{filename}", input_code)
            input_count += 1
        corrected_code = corrected_lookup.get(filename) or corrected_lookup.get(os.path.basename(filename))
        if corrected_code:
            _add_unique_zip_entry(zip_files, f"corrected/{_corrected_name_for(filename)}", corrected_code)
            corrected_count += 1

    for source in source_files:
        filename = _safe_zip_path(source.get("filename") or "source.c")
        if filename in source_paths:
            continue
        source_paths.add(filename)
        _add_unique_zip_entry(zip_files, f"input/{filename}", source.get("source_code") or "")
        input_count += 1
        corrected_code = (
            corrected_lookup.get(filename)
            or corrected_lookup.get(source.get("filename") or "")
            or corrected_lookup.get(os.path.basename(filename))
        )
        if corrected_code:
            _add_unique_zip_entry(zip_files, f"corrected/{_corrected_name_for(filename)}", corrected_code)
            corrected_count += 1

    for file_path, corrected_code in corrected_by_file.items():
        filename = _safe_zip_path(file_path)
        if filename not in source_paths and corrected_code:
            _add_unique_zip_entry(zip_files, f"corrected/{_corrected_name_for(filename)}", corrected_code)
            corrected_count += 1

    if input_count == 0:
        raise ValueError("Original scanned source code is not available for this report.")
    if corrected_count == 0:
        raise ValueError("Corrected code is not available for this report. Run a new scan and generate the report again.")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for filename, content in zip_files.items():
            archive.writestr(filename, content)

    project_name = scan.get("project_name") or scan.get("file_name") or "secureguard-code"
    safe_download_name = "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in project_name).strip("-")
    return zip_buffer.getvalue(), f"{safe_download_name or 'secureguard-code'}-{scan_id}-code.zip"


def build_code_zip_for_report(supabase: Client, report: dict, user_id: str) -> tuple[bytes, str]:
    """Build code ZIP for a report, preferring code stored inside the report artifact."""
    scan_id = report.get("scan_id")
    if not scan_id:
        raise ValueError("This report is not linked to a scan.")

    artifact_zip = _code_zip_from_report_artifact(supabase, report.get("file_path"))
    report_name = report.get("name") or "secureguard-code"
    safe_name = "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in report_name).strip("-")
    if artifact_zip:
        return artifact_zip, f"{safe_name or 'secureguard-code'}-{scan_id}-code.zip"

    pdf_zip = _code_zip_from_report_pdf_artifact(
        supabase,
        report.get("file_path"),
        f"{safe_name or 'secureguard-code'}-{scan_id}-code.zip",
    )
    if pdf_zip:
        return pdf_zip

    return build_code_zip_for_scan(supabase, scan_id, user_id)
