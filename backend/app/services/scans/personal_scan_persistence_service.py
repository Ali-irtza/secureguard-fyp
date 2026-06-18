import gzip
import io
import json
import csv
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath

from fastapi import HTTPException, status
from supabase import Client

from app.services.projects.project_service import require_owner
from app.services.scans.report_storage_service import build_pdf_report

ARTIFACT_BUCKET = "scan-artifacts"
REPORT_TTL_DAYS = 5
SEVERITY_PENALTIES = {
    "critical": 20,
    "high": 10,
    "medium": 5,
    "low": 2,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_path_part(value: str) -> str:
    name = PurePosixPath(value.replace("\\", "/")).name
    return name or "source.c"


def _normalize_severity(value: object, risk_score: object = None) -> str:
    severity = str(value or "").strip().lower()
    if "critical" in severity:
        return "critical"
    if "high" in severity:
        return "high"
    if "medium" in severity:
        return "medium"
    if "low" in severity:
        return "low"

    try:
        score = int(risk_score or 0)
    except (TypeError, ValueError):
        score = 0

    if score >= 90:
        return "critical"
    if score >= 70:
        return "high"
    if score >= 40:
        return "medium"
    if score > 0:
        return "low"
    return "info"


def _severity_counts(vulnerabilities: list[dict]) -> dict[str, int]:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for vulnerability in vulnerabilities:
        severity = vulnerability.get("normalized_severity") or _normalize_severity(
            vulnerability.get("severity") or vulnerability.get("risk_level") or vulnerability.get("location"),
            vulnerability.get("risk_score"),
        )
        if severity in counts:
            counts[severity] += 1
    return counts


def _normalized_vulnerabilities(vulnerabilities: list[dict]) -> list[dict]:
    normalized = []
    for vulnerability in vulnerabilities:
        severity = _normalize_severity(
            vulnerability.get("severity") or vulnerability.get("risk_level") or vulnerability.get("location"),
            vulnerability.get("risk_score"),
        )
        line = _line_number(vulnerability.get("absolute_line") or vulnerability.get("line_number"))
        row = {**vulnerability, "normalized_severity": severity}
        if line is not None:
            row["absolute_line"] = line
            row["line_number"] = line
        normalized.append(row)
    return normalized


def _health_score(counts: dict[str, int]) -> int:
    penalty = (
        counts["critical"] * SEVERITY_PENALTIES["critical"]
        + counts["high"] * SEVERITY_PENALTIES["high"]
        + counts["medium"] * SEVERITY_PENALTIES["medium"]
        + counts["low"] * SEVERITY_PENALTIES["low"]
    )
    return max(0, 100 - penalty)


def _risk_level(counts: dict[str, int]) -> str:
    if counts["critical"]:
        return "Critical Risk"
    if counts["high"]:
        return "High Risk"
    if counts["medium"]:
        return "Medium Risk"
    if counts["low"]:
        return "Low Risk"
    return "Safe"


def _risk_score(counts: dict[str, int]) -> int:
    return min(100, 100 - _health_score(counts))


def _line_number(value: object) -> int | None:
    try:
        number = int(value or 0)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _chunk_bounds(chunk: dict) -> tuple[int | None, int | None]:
    start = _line_number(chunk.get("start_line") or chunk.get("chunk_start_line"))
    end = _line_number(chunk.get("end_line") or chunk.get("chunk_end_line"))
    return start, end


def _chunk_vulnerabilities(file_name: str, chunk: dict, vulnerabilities: list[dict]) -> list[dict]:
    chunk_vulns = chunk.get("vulnerabilities")
    if isinstance(chunk_vulns, list):
        return [
            {
                **item,
                "absolute_line": _line_number(item.get("absolute_line") or item.get("line_number")),
                "line_number": _line_number(item.get("absolute_line") or item.get("line_number")),
                "normalized_severity": _normalize_severity(
                    item.get("severity") or item.get("risk_level") or item.get("location"),
                    item.get("risk_score"),
                ),
            }
            for item in chunk_vulns
        ]

    start, end = _chunk_bounds(chunk)
    matched = []
    for vulnerability in vulnerabilities:
        vuln_file = vulnerability.get("file_path")
        if vuln_file and vuln_file != file_name:
            continue
        line = _line_number(vulnerability.get("absolute_line") or vulnerability.get("line_number"))
        if start is not None and end is not None and line is not None and not (start <= line <= end):
            continue
        matched.append(vulnerability)
    return matched


def _language_from_files(files_dict: dict[str, str]) -> str | None:
    has_c = False
    has_cpp = False
    for filename in files_dict:
        ext = PurePosixPath(filename).suffix.lower()
        if ext in {".cpp", ".cc", ".cxx", ".hpp", ".hxx"}:
            has_cpp = True
        elif ext in {".c", ".h"}:
            has_c = True
    if has_c and has_cpp:
        return "C, C++"
    if has_cpp:
        return "C++"
    if has_c:
        return "C"
    return None


def _file_snapshot(files_dict: dict[str, str]) -> list[dict]:
    return [
        {
            "file_name": filename,
            "file_size": len(source.encode("utf-8")),
        }
        for filename, source in files_dict.items()
    ]


def _source_slice(source_code: str, start_line: object, end_line: object) -> str:
    start = _line_number(start_line) or 1
    end = _line_number(end_line)
    lines = str(source_code or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if len(lines) > 1 and lines[-1] == "":
        lines.pop()
    if not end or end < start:
        end = len(lines)
    return "\n".join(lines[start - 1 : end])


def create_scan_started(
    supabase: Client,
    user_id: str,
    project_id: str,
    files_dict: dict[str, str],
    scan_type: str = "upload",
) -> str:
    if not project_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Project is required before scanning.")

    require_owner(project_id, user_id, supabase)
    now = _now_iso()
    payload = {
        "project_id": project_id,
        "user_id": user_id,
        "programming_language": _language_from_files(files_dict),
        "scan_type": scan_type,
        "completion_status": "running",
        "file_names": _file_snapshot(files_dict),
        "started_at": now,
        "created_at": now,
        "updated_at": now,
    }
    result = supabase.table("scan").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create scan record.")
    return result.data[0]["scan_id"]


def mark_scan_failed(supabase: Client, scan_id: str, error_message: str) -> None:
    now = _now_iso()
    supabase.table("scan").update(
        {
            "completion_status": "failed",
            "risk_score": 0,
            "risk_level": "Failed",
            "error_message": error_message,
            "completed_at": now,
        }
    ).eq("scan_id", scan_id).execute()


def _upload_bytes(supabase: Client, storage_path: str, content: bytes, content_type: str) -> None:
    supabase.storage.from_(ARTIFACT_BUCKET).upload(
        storage_path,
        content,
        file_options={
            "content-type": content_type,
            "upsert": "true",
            "x-upsert": "true",
        },
    )


def _download_bytes(supabase: Client, storage_path: str) -> bytes:
    return supabase.storage.from_(ARTIFACT_BUCKET).download(storage_path)


def _build_result_json(
    scan_id: str,
    project: dict,
    files_dict: dict[str, str],
    result: dict,
    counts: dict[str, int],
    vulnerabilities: list[dict],
) -> bytes:
    payload = {
        "scan": {
            "scan_id": scan_id,
            "risk_level": _risk_level(counts),
            "risk_score": _risk_score(counts),
            "health_score": _health_score(counts),
            "total_vuln": len(result.get("vulnerabilities") or []),
            "files_scanned": result.get("files_analyzed") or len(files_dict),
            "total_chunks_scanned": result.get("total_chunks_scanned") or 0,
        },
        "project": {
            "project_id": project.get("project_id"),
            "project_name": project.get("project_name"),
            "project_language": project.get("project_language"),
        },
        "summary": {
            "critical_count": counts["critical"],
            "high_count": counts["high"],
            "medium_count": counts["medium"],
            "low_count": counts["low"],
        },
        "files": [],
        "vulnerabilities": vulnerabilities,
    }

    result_files = {
        item.get("filename") or item.get("file_path"): item
        for item in result.get("files") or []
    }
    for filename, source_code in files_dict.items():
        file_result = result_files.get(filename) or {}
        chunks = []
        for chunk in file_result.get("chunk_outputs") or []:
            start_line, end_line = _chunk_bounds(chunk)
            chunks.append(
                {
                    "chunk_index": chunk.get("chunk_index"),
                    "start_line": start_line,
                    "end_line": end_line,
                    "summary": chunk.get("summary"),
                    "vulnerabilities": _chunk_vulnerabilities(filename, chunk, vulnerabilities),
                    "corrected_code": chunk.get("corrected_code") or "None",
                }
            )
        payload["files"].append(
            {
                "file_name": filename,
                "original_code": source_code,
                "chunks": chunks,
                "merged_corrected_code": file_result.get("corrected_code") or "None",
            }
        )

    return gzip.compress(json.dumps(payload, ensure_ascii=False).encode("utf-8"))


def _load_result_json(supabase: Client, storage_path: str) -> dict:
    content = _download_bytes(supabase, storage_path)
    return json.loads(gzip.decompress(content).decode("utf-8"))


def _flatten_chunks(result_payload: dict) -> list[dict]:
    chunks = []
    for file_item in result_payload.get("files") or []:
        file_name = file_item.get("file_name") or "source.c"
        original_code = file_item.get("original_code") or ""
        for chunk in file_item.get("chunks") or []:
            start_line = chunk.get("start_line") or 1
            end_line = chunk.get("end_line") or 0
            chunks.append(
                {
                    "file_path": file_name,
                    "start_line": start_line,
                    "end_line": end_line,
                    "code": _source_slice(original_code, start_line, end_line),
                    "corrected_code": chunk.get("corrected_code") or file_item.get("merged_corrected_code") or "None",
                }
            )
    return chunks


def _scan_to_history(scan: dict, result_row: dict | None = None, result_payload: dict | None = None) -> dict:
    file_names = scan.get("file_names") or []
    display_names = []
    if isinstance(file_names, list):
        display_names = [str(item.get("file_name") or "") for item in file_names if isinstance(item, dict)]
    counts = {
        "critical": int((result_row or {}).get("critical_count") or 0),
        "high": int((result_row or {}).get("high_count") or 0),
        "medium": int((result_row or {}).get("medium_count") or 0),
        "low": int((result_row or {}).get("low_count") or 0),
    }
    project_name = None
    if result_payload:
        project_name = (result_payload.get("project") or {}).get("project_name")
    health_score = (result_payload.get("scan") or {}).get("health_score") if result_payload else None
    if health_score is None:
        health_score = _health_score(counts)
    return {
        "id": scan.get("scan_id"),
        "scan_id": scan.get("scan_id"),
        "project_id": scan.get("project_id"),
        "project_name": project_name,
        "scan_type": scan.get("scan_type"),
        "file_name": ", ".join(name for name in display_names if name)[:500],
        "branch": None,
        "status": scan.get("completion_status"),
        "completion_status": scan.get("completion_status"),
        "risk_level": scan.get("risk_level"),
        "risk_score": scan.get("risk_score"),
        "health_score": health_score,
        "total_vulns": scan.get("total_vuln"),
        "total_vuln": scan.get("total_vuln"),
        "files_scanned": scan.get("files_scanned"),
        "duration_secs": scan.get("scan_duration"),
        "scan_duration": scan.get("scan_duration"),
        "error_message": scan.get("error_message"),
        "started_at": scan.get("started_at"),
        "completed_at": scan.get("completed_at"),
        "created_at": scan.get("created_at"),
        "updated_at": scan.get("updated_at"),
        "report_storage_path": result_row.get("report_pdf_path") if result_row else None,
        "report_expires_at": None,
        "corrected_code": None,
        "chunk_outputs": _flatten_chunks(result_payload) if result_payload else [],
        "severity_counts": counts,
        "critical_findings": [],
        "alert_findings": [],
    }


def _source_line(source_code: str, line_number: object) -> str:
    line = _line_number(line_number)
    if line is None:
        return ""
    lines = str(source_code or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return lines[line - 1] if 0 <= line - 1 < len(lines) else ""


def _corrected_line(file_item: dict, line_number: object) -> str:
    line = _line_number(line_number)
    if line is None:
        return ""
    for chunk in file_item.get("chunks") or []:
        start = _line_number(chunk.get("start_line")) or 1
        end = _line_number(chunk.get("end_line")) or start
        if start <= line <= end:
            corrected_lines = str(chunk.get("corrected_code") or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
            index = line - start
            if 0 <= index < len(corrected_lines):
                return corrected_lines[index]
    merged_lines = str(file_item.get("merged_corrected_code") or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return merged_lines[line - 1] if 0 <= line - 1 < len(merged_lines) else ""


def _nearest_non_empty_corrected_line(file_item: dict, line_number: object) -> str:
    line = _line_number(line_number)
    corrected = str(file_item.get("merged_corrected_code") or "")
    if not corrected or corrected in {"None", "Pending..."}:
        return ""
    lines = corrected.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if not lines:
        return ""
    preferred = max(0, min((line or 1) - 1, len(lines) - 1))
    if lines[preferred].strip():
        return lines[preferred]
    for distance in range(1, len(lines)):
        before = preferred - distance
        after = preferred + distance
        if before >= 0 and lines[before].strip():
            return lines[before]
        if after < len(lines) and lines[after].strip():
            return lines[after]
    return ""


def _corrected_line_from_suggestion(file_item: dict, vulnerability: dict) -> str:
    corrected = str(file_item.get("merged_corrected_code") or "")
    if not corrected or corrected in {"None", "Pending..."}:
        return ""
    lines = corrected.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    suggestion = str(vulnerability.get("fix_suggestion") or "").lower()
    patterns: list[str] = []
    if "i < line_limit" in suggestion:
        patterns.append("i < LINE_LIMIT")
    if "line_limit - 1" in suggestion:
        patterns.append("LINE_LIMIT - 1")
    if "printf" in suggestion and "%s" in suggestion:
        patterns.append('printf("%s"')
    if "strncpy" in suggestion:
        patterns.append("strncpy")
    if "null-termination" in suggestion or "null termination" in suggestion:
        patterns.append("LINE_LIMIT - 1")
    if "remove the second call" in suggestion and "free" in suggestion:
        patterns.append("free(")

    for pattern in patterns:
        for line in lines:
            if pattern in line:
                return line
    return ""


def _best_corrected_line(file_item: dict, vulnerability: dict) -> str:
    line_number = vulnerability.get("absolute_line") or vulnerability.get("line_number")
    suggested = _corrected_line_from_suggestion(file_item, vulnerability)
    if suggested.strip():
        return suggested
    direct = _corrected_line(file_item, line_number)
    if direct.strip():
        return direct
    return _nearest_non_empty_corrected_line(file_item, line_number)


def _file_for_vulnerability(result_payload: dict, vulnerability: dict) -> dict:
    file_path = str(vulnerability.get("file_path") or "")
    files = result_payload.get("files") or []
    for file_item in files:
        if file_item.get("file_name") == file_path:
            return file_item
    return files[0] if len(files) == 1 else {}


def _build_report_csv(result_payload: dict) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "file_name",
        "line_number",
        "incorrect_line",
        "cwe_id",
        "cwe_name",
        "severity",
        "description",
        "fix_suggestion",
        "corrected_line",
    ])
    for vulnerability in result_payload.get("vulnerabilities") or []:
        file_item = _file_for_vulnerability(result_payload, vulnerability)
        line_number = vulnerability.get("absolute_line") or vulnerability.get("line_number")
        writer.writerow([
            vulnerability.get("file_path") or file_item.get("file_name") or "",
            line_number or "",
            vulnerability.get("affected_code") or _source_line(file_item.get("original_code") or "", line_number),
            vulnerability.get("cwe_id") or "",
            vulnerability.get("cwe_name") or "",
            vulnerability.get("normalized_severity") or vulnerability.get("severity") or "",
            vulnerability.get("description") or "",
            vulnerability.get("fix_suggestion") or "",
            _best_corrected_line(file_item, vulnerability),
        ])
    return ("\ufeff" + output.getvalue()).encode("utf-8")


def _build_report_pdf(result_payload: dict) -> bytes:
    scan_data = {
        **(result_payload.get("scan") or {}),
        "project_name": (result_payload.get("project") or {}).get("project_name"),
        "scan_type": "upload",
        "chunk_outputs": _flatten_chunks(result_payload),
    }
    return build_pdf_report(scan_data, result_payload.get("vulnerabilities") or [])


def _result_row_for_scan(supabase: Client, scan_id: str) -> dict | None:
    result = (
        supabase.table("scan_results")
        .select("*")
        .eq("scan_id", scan_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def get_scans_for_user_new(supabase: Client, user_id: str, limit: int = 50) -> list[dict]:
    result = (
        supabase.table("scan")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    scans = result.data or []
    scan_ids = [scan["scan_id"] for scan in scans if scan.get("scan_id")]
    results_by_scan = {}
    if scan_ids:
        results = supabase.table("scan_results").select("*").in_("scan_id", scan_ids).execute()
        results_by_scan = {row["scan_id"]: row for row in results.data or []}

    projects_by_id = {}
    project_ids = list({scan.get("project_id") for scan in scans if scan.get("project_id")})
    if project_ids:
        projects = supabase.table("projects").select("project_id,project_name").in_("project_id", project_ids).execute()
        projects_by_id = {row["project_id"]: row for row in projects.data or []}

    rows = []
    for scan in scans:
        row = _scan_to_history(scan, results_by_scan.get(scan.get("scan_id")))
        project = projects_by_id.get(scan.get("project_id"))
        if project:
            row["project_name"] = project.get("project_name")
        rows.append(row)
    return rows


def get_scan_detail_new(supabase: Client, scan_id: str, user_id: str) -> dict:
    scan_result = (
        supabase.table("scan")
        .select("*")
        .eq("scan_id", scan_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    scan_rows = scan_result.data or []
    if not scan_rows:
        raise ValueError("Scan not found.")
    scan = scan_rows[0]
    result_row = _result_row_for_scan(supabase, scan_id)
    result_payload = None
    if result_row and result_row.get("result_json_path"):
        result_payload = _load_result_json(supabase, result_row["result_json_path"])
    scan_view = _scan_to_history(scan, result_row, result_payload)
    vulnerabilities = []
    source_files = []
    if result_payload:
        for index, vulnerability in enumerate(result_payload.get("vulnerabilities") or [], start=1):
            vulnerabilities.append(
                {
                    "id": f"{scan_id}-{index}",
                    "scan_id": scan_id,
                    "severity": vulnerability.get("normalized_severity") or vulnerability.get("severity") or "low",
                    "type": vulnerability.get("type") or vulnerability.get("cwe_id") or "",
                    "cwe_id": vulnerability.get("cwe_id"),
                    "cwe_name": vulnerability.get("cwe_name"),
                    "line_number": vulnerability.get("line_number"),
                    "absolute_line": vulnerability.get("absolute_line"),
                    "description": vulnerability.get("description") or "",
                    "fix_suggestion": vulnerability.get("fix_suggestion"),
                    "function_name": vulnerability.get("function_name"),
                    "file_path": vulnerability.get("file_path"),
                    "code_snippet": vulnerability.get("affected_code") or vulnerability.get("code_snippet"),
                    "location": vulnerability.get("location"),
                    "created_at": scan.get("created_at"),
                }
            )
        for file_item in result_payload.get("files") or []:
            source_files.append(
                {
                    "filename": file_item.get("file_name") or "source.c",
                    "source_code": file_item.get("original_code") or "",
                    "storage_path": result_row.get("result_json_path") if result_row else None,
                }
            )
    return {"scan": scan_view, "vulnerabilities": vulnerabilities, "source_files": source_files}


def delete_scan_for_user_new(supabase: Client, scan_id: str, user_id: str) -> str:
    scan_result = (
        supabase.table("scan")
        .select("scan_id")
        .eq("scan_id", scan_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not scan_result.data:
        raise ValueError("Scan not found.")

    result_row = _result_row_for_scan(supabase, scan_id)
    paths = []
    if result_row:
        paths.extend(
            path
            for path in [
                result_row.get("result_json_path"),
                result_row.get("corrected_code_zip_path"),
                result_row.get("report_pdf_path"),
                result_row.get("report_csv_path"),
            ]
            if path
        )
    report_rows = (
        supabase.table("reports")
        .select("report_storage_path")
        .eq("scan_id", scan_id)
        .eq("user_id", user_id)
        .execute()
    )
    paths.extend(row["report_storage_path"] for row in report_rows.data or [] if row.get("report_storage_path"))
    if paths:
        supabase.storage.from_(ARTIFACT_BUCKET).remove(paths)
    supabase.table("reports").delete().eq("scan_id", scan_id).eq("user_id", user_id).execute()
    supabase.table("scan").delete().eq("scan_id", scan_id).eq("user_id", user_id).execute()
    return scan_id


def _build_corrected_code_zip(files_dict: dict[str, str], result: dict) -> bytes:
    result_files = {
        item.get("filename") or item.get("file_path"): item
        for item in result.get("files") or []
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for filename, source_code in files_dict.items():
            corrected = (result_files.get(filename) or {}).get("corrected_code")
            if not corrected or corrected in {"None", "Pending..."}:
                corrected = source_code
            safe_name = _safe_path_part(filename)
            archive.writestr(f"input/{safe_name}", source_code)
            archive.writestr(f"corrected/{safe_name}", corrected)
    return buffer.getvalue()


def _build_code_zip_from_result(result_payload: dict) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for file_item in result_payload.get("files") or []:
            safe_name = _safe_path_part(file_item.get("file_name") or "source.c")
            original_code = file_item.get("original_code") or ""
            corrected_code = file_item.get("merged_corrected_code") or original_code
            if corrected_code in {"None", "Pending..."}:
                corrected_code = original_code
            archive.writestr(f"input/{safe_name}", original_code)
            archive.writestr(f"corrected/{safe_name}", corrected_code)
    return buffer.getvalue()


def _update_project_health_score(supabase: Client, project_id: str, health_score: int) -> None:
    supabase.table("projects").update(
        {
            "health_score": health_score,
            "updated_at": _now_iso(),
        }
    ).eq("project_id", project_id).execute()


def _ensure_scan_report_metadata(supabase: Client, user_id: str, scan_id: str, project_name: str | None) -> dict | None:
    existing = (
        supabase.table("reports")
        .select("*")
        .eq("scan_id", scan_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = existing.data or []
    if rows:
        return rows[0]

    report_id = str(uuid.uuid4())
    inserted = (
        supabase.table("reports")
        .insert(
            {
                "report_id": report_id,
                "scan_id": scan_id,
                "user_id": user_id,
                "report_name": f"{project_name or 'Scan'} Report",
                "report_format": "pdf",
                "report_status": "completed",
                "report_storage_path": None,
                "report_expiry": (datetime.now(timezone.utc) + timedelta(days=REPORT_TTL_DAYS)).isoformat(),
            }
        )
        .execute()
    )
    return (inserted.data or [None])[0]


def save_scan_success(
    supabase: Client,
    user_id: str,
    project_id: str,
    scan_id: str,
    files_dict: dict[str, str],
    result: dict,
    duration_seconds: int,
) -> dict:
    project = require_owner(project_id, user_id, supabase)
    vulnerabilities = _normalized_vulnerabilities(result.get("vulnerabilities") or [])
    counts = _severity_counts(vulnerabilities)
    health_score = _health_score(counts)
    risk_level = _risk_level(counts)
    risk_score = _risk_score(counts)
    base_path = f"users/{user_id}/scans/{scan_id}"
    result_json_path = f"{base_path}/result.json.gz"
    corrected_code_zip_path = f"{base_path}/corrected_code.zip"

    _upload_bytes(
        supabase,
        result_json_path,
        _build_result_json(scan_id, project, files_dict, result, counts, vulnerabilities),
        "application/gzip",
    )
    _upload_bytes(
        supabase,
        corrected_code_zip_path,
        _build_corrected_code_zip(files_dict, result),
        "application/zip",
    )

    now = _now_iso()
    supabase.table("scan").update(
        {
            "completion_status": "completed",
            "risk_score": risk_score,
            "risk_level": risk_level,
            "total_vuln": len(vulnerabilities),
            "files_scanned": result.get("files_analyzed") or len(files_dict),
            "scan_duration": duration_seconds,
            "completed_at": now,
            "error_message": None,
        }
    ).eq("scan_id", scan_id).execute()

    supabase.table("scan_results").upsert(
        {
            "scan_id": scan_id,
            "critical_count": counts["critical"],
            "high_count": counts["high"],
            "medium_count": counts["medium"],
            "low_count": counts["low"],
            "result_json_path": result_json_path,
            "corrected_code_zip_path": corrected_code_zip_path,
        }
    ).execute()

    _update_project_health_score(supabase, project_id, health_score)
    _ensure_scan_report_metadata(supabase, user_id, scan_id, project.get("project_name"))

    return {
        "scan_id": scan_id,
        "health_score": health_score,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "counts": counts,
        "result_json_path": result_json_path,
        "corrected_code_zip_path": corrected_code_zip_path,
    }


def _report_to_response(row: dict, scan_row: dict | None = None) -> dict:
    return {
        "id": row.get("report_id"),
        "scan_id": row.get("scan_id"),
        "user_id": row.get("user_id"),
        "name": row.get("report_name"),
        "format": row.get("report_format"),
        "status": "completed" if row.get("report_status") == "completed" else row.get("report_status"),
        "file_path": row.get("report_storage_path"),
        "expires_at": row.get("report_expiry"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "scans": scan_row,
    }


def _backfill_missing_report_metadata(supabase: Client, user_id: str) -> None:
    existing = (
        supabase.table("reports")
        .select("scan_id")
        .eq("user_id", user_id)
        .execute()
    )
    existing_scan_ids = {row.get("scan_id") for row in existing.data or [] if row.get("scan_id")}

    scans_result = (
        supabase.table("scan")
        .select("scan_id,project_id")
        .eq("user_id", user_id)
        .eq("completion_status", "completed")
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    scans = scans_result.data or []
    missing_scans = [scan for scan in scans if scan.get("scan_id") not in existing_scan_ids]
    if not missing_scans:
        return

    project_ids = list({scan.get("project_id") for scan in missing_scans if scan.get("project_id")})
    projects_by_id = {}
    if project_ids:
        projects = (
            supabase.table("projects")
            .select("project_id,project_name")
            .in_("project_id", project_ids)
            .execute()
        )
        projects_by_id = {row["project_id"]: row for row in projects.data or []}

    for scan in missing_scans:
        project = projects_by_id.get(scan.get("project_id")) or {}
        _ensure_scan_report_metadata(supabase, user_id, scan["scan_id"], project.get("project_name"))


def list_on_demand_reports(supabase: Client, user_id: str) -> list[dict]:
    result = (
        supabase.table("reports")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    reports = result.data or []
    if not reports:
        _backfill_missing_report_metadata(supabase, user_id)
        result = (
            supabase.table("reports")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        reports = result.data or []
    scan_ids = [row["scan_id"] for row in reports if row.get("scan_id")]
    scans_by_id = {}
    if scan_ids:
        scan_result = supabase.table("scan").select("*").in_("scan_id", scan_ids).execute()
        scans_by_id = {row["scan_id"]: row for row in scan_result.data or []}
    project_ids = list({scan.get("project_id") for scan in scans_by_id.values() if scan.get("project_id")})
    projects_by_id = {}
    if project_ids:
        project_result = supabase.table("projects").select("project_id,project_name").in_("project_id", project_ids).execute()
        projects_by_id = {row["project_id"]: row for row in project_result.data or []}

    response = []
    for row in reports:
        scan = scans_by_id.get(row.get("scan_id"))
        scan_view = None
        if scan:
            scan_view = _scan_to_history(scan)
            project = projects_by_id.get(scan.get("project_id"))
            if project:
                scan_view["project_name"] = project.get("project_name")
        response.append(_report_to_response(row, scan_view))
    return response


def _latest_completed_scan_for_project(
    supabase: Client,
    user_id: str,
    project_id: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    require_owner(project_id, user_id, supabase)
    query = (
        supabase.table("scan")
        .select("*")
        .eq("project_id", project_id)
        .eq("user_id", user_id)
        .eq("completion_status", "completed")
        .order("completed_at", desc=True)
        .limit(1)
    )
    if start_date:
        query = query.gte("created_at", start_date)
    if end_date:
        query = query.lte("created_at", end_date)
    result = query.execute()
    if not result.data:
        raise ValueError("No completed scans found for the selected project and date range.")
    return result.data[0]


def create_on_demand_report(
    supabase: Client,
    user_id: str,
    project_id: str,
    report_format: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    formats = ["pdf", "csv"] if report_format == "both" else [report_format]
    scan = _latest_completed_scan_for_project(supabase, user_id, project_id, start_date, end_date)
    result_row = (
        supabase.table("scan_results")
        .select("*")
        .eq("scan_id", scan["scan_id"])
        .single()
        .execute()
    )
    if not result_row.data or not result_row.data.get("result_json_path"):
        raise ValueError("Stored scan result artifact is not available.")

    result_payload = _load_result_json(supabase, result_row.data["result_json_path"])
    created_reports = []
    for fmt in formats:
        report_id = str(uuid.uuid4())
        if fmt == "pdf":
            content = _build_report_pdf(result_payload)
            content_type = "application/pdf"
        elif fmt == "csv":
            content = _build_report_csv(result_payload)
            content_type = "text/csv; charset=utf-8"
        else:
            raise ValueError("Report format must be pdf, csv, or both.")

        storage_path = f"users/{user_id}/scans/{scan['scan_id']}/reports/{report_id}.{fmt}"
        _upload_bytes(supabase, storage_path, content, content_type)
        expires_at = (datetime.now(timezone.utc) + timedelta(days=REPORT_TTL_DAYS)).isoformat()
        inserted = (
            supabase.table("reports")
            .insert(
                {
                    "report_id": report_id,
                    "scan_id": scan["scan_id"],
                    "user_id": user_id,
                    "report_name": f"{(result_payload.get('project') or {}).get('project_name') or 'Scan'} Report",
                    "report_format": fmt,
                    "report_status": "completed",
                    "report_storage_path": storage_path,
                    "report_expiry": expires_at,
                }
            )
            .execute()
        )
        if inserted.data:
            scan_result_view = {
                "id": scan.get("scan_id"),
                "project_id": scan.get("project_id"),
                "project_name": (result_payload.get("project") or {}).get("project_name"),
                "scan_type": scan.get("scan_type"),
                "file_name": ", ".join(item.get("file_name", "") for item in result_payload.get("files") or [])[:500],
                "risk_level": scan.get("risk_level"),
                "total_vulns": scan.get("total_vuln"),
                "files_scanned": scan.get("files_scanned"),
                "created_at": scan.get("created_at"),
                "completed_at": scan.get("completed_at"),
            }
            created_reports.append(_report_to_response(inserted.data[0], scan_result_view))

    return created_reports


def get_on_demand_report(supabase: Client, report_id: str, user_id: str) -> dict:
    result = (
        supabase.table("reports")
        .select("*")
        .eq("report_id", report_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise ValueError("Report not found.")
    return result.data


def download_on_demand_report(supabase: Client, report_id: str, user_id: str, requested_format: str | None = None) -> tuple[bytes, str, str]:
    report = get_on_demand_report(supabase, report_id, user_id)
    storage_path = report.get("report_storage_path")
    fmt = requested_format or report.get("report_format") or "pdf"
    if fmt not in {"pdf", "csv"}:
        raise ValueError("Report format must be pdf or csv.")

    result_row = _result_row_for_scan(supabase, report["scan_id"])
    if result_row and result_row.get("result_json_path"):
        result_payload = _load_result_json(supabase, result_row["result_json_path"])
        if fmt == "pdf":
            content = _build_report_pdf(result_payload)
            content_type = "application/pdf"
            result_column = "report_pdf_path"
        else:
            content = _build_report_csv(result_payload)
            content_type = "text/csv; charset=utf-8"
            result_column = "report_csv_path"

        storage_path = f"users/{user_id}/scans/{report['scan_id']}/reports/{report_id}.{fmt}"
        _upload_bytes(supabase, storage_path, content, content_type)
        expires_at = (datetime.now(timezone.utc) + timedelta(days=REPORT_TTL_DAYS)).isoformat()
        (
            supabase.table("reports")
            .update(
                {
                    "report_format": fmt,
                    "report_status": "completed",
                    "report_storage_path": storage_path,
                    "report_expiry": expires_at,
                }
            )
            .eq("report_id", report_id)
            .eq("user_id", user_id)
            .execute()
        )
        (
            supabase.table("scan_results")
            .update({result_column: storage_path})
            .eq("scan_id", report["scan_id"])
            .execute()
        )
    elif storage_path and str(storage_path).lower().endswith(f".{fmt}"):
        content = _download_bytes(supabase, storage_path)
    else:
            raise ValueError("Stored scan result artifact is not available.")

    media_type = "text/csv; charset=utf-8" if fmt == "csv" else "application/pdf"
    filename = f"{report.get('report_name') or 'secureguard-report'}-{report_id}.{fmt}".replace("/", "-").replace("\\", "-")
    return content, filename, media_type


def download_corrected_code_zip(supabase: Client, report_id: str, user_id: str) -> tuple[bytes, str]:
    report = get_on_demand_report(supabase, report_id, user_id)
    result = (
        supabase.table("scan_results")
        .select("result_json_path,corrected_code_zip_path")
        .eq("scan_id", report["scan_id"])
        .single()
        .execute()
    )
    if not result.data:
        raise ValueError("Corrected code ZIP is not available.")
    if result.data.get("result_json_path"):
        result_payload = _load_result_json(supabase, result.data["result_json_path"])
        content = _build_code_zip_from_result(result_payload)
        storage_path = result.data.get("corrected_code_zip_path") or f"users/{user_id}/scans/{report['scan_id']}/corrected_code.zip"
        _upload_bytes(supabase, storage_path, content, "application/zip")
        (
            supabase.table("scan_results")
            .update({"corrected_code_zip_path": storage_path})
            .eq("scan_id", report["scan_id"])
            .execute()
        )
    elif result.data.get("corrected_code_zip_path"):
        content = _download_bytes(supabase, result.data["corrected_code_zip_path"])
    else:
        raise ValueError("Corrected code ZIP is not available.")
    filename = f"{report.get('report_name') or 'secureguard-report'}-{report_id}-code.zip".replace("/", "-").replace("\\", "-")
    return content, filename


def build_scan_pdf_for_user(supabase: Client, scan_id: str, user_id: str) -> bytes:
    scan_result = (
        supabase.table("scan")
        .select("scan_id")
        .eq("scan_id", scan_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not scan_result.data:
        raise ValueError("Scan not found.")
    result_row = _result_row_for_scan(supabase, scan_id)
    if not result_row or not result_row.get("result_json_path"):
        raise ValueError("Stored scan result artifact is not available.")
    return _build_report_pdf(_load_result_json(supabase, result_row["result_json_path"]))


def delete_on_demand_report(supabase: Client, report_id: str, user_id: str) -> str:
    report = get_on_demand_report(supabase, report_id, user_id)
    storage_path = report.get("report_storage_path")
    if storage_path:
        supabase.storage.from_(ARTIFACT_BUCKET).remove([storage_path])
    supabase.table("reports").delete().eq("report_id", report_id).eq("user_id", user_id).execute()
    return report_id
