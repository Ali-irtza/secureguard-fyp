from supabase import Client
import time
import random

import httpcore
import httpx
from typing import Dict, List
from datetime import datetime, timezone
from app.services.scans.report_storage_service import REPORT_BUCKET, create_zipped_pdf_report, create_zipped_report, cleanup_expired_reports


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
                    "corrected_code": scan_data.get("corrected_code"),
                    "chunk_outputs": scan_data.get("chunk_outputs", []),
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
    """Fetch a single scan and all its associated vulnerabilities."""
    scan_result = (
        supabase.table("scans")
        .select("*")
        .eq("id", scan_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not scan_result.data:
        raise ValueError("Scan not found")

    vulns_result = (
        supabase.table("vulnerabilities")
        .select("*")
        .eq("scan_id", scan_id)
        .execute()
    )

    return {
        "scan": scan_result.data,
        "vulnerabilities": vulns_result.data,
    }
