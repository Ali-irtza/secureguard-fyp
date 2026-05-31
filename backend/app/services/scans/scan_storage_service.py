from supabase import Client
from typing import Dict, List
from datetime import datetime, timezone
from app.services.scans.report_storage_service import create_zipped_pdf_report, cleanup_expired_reports


def create_scan_record(
    supabase: Client, user_id: str, project_id: str, scan_data: dict
) -> str:
    """Insert a new row into the scans table and return the new scan's id."""
    result = (
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
    result = (
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

    supabase.table("vulnerabilities").insert(rows).execute()


def save_report_artifact(
    supabase: Client,
    user_id: str,
    scan_id: str,
    scan_data: dict,
    vulnerabilities: List[Dict],
) -> None:
    """Create a zipped PDF report in storage and a report metadata row."""
    artifact = create_zipped_pdf_report(supabase, user_id, scan_id, scan_data, vulnerabilities)
    supabase.table("scans").update(
        {
            "report_storage_path": artifact["path"],
            "report_expires_at": artifact["expires_at"],
        }
    ).eq("id", scan_id).execute()
    supabase.table("reports").insert(
        {
            "scan_id": scan_id,
            "user_id": user_id,
            "name": f"{scan_data.get('project_name') or 'Scan'} Report",
            "format": "pdf",
            "status": "completed",
            "file_path": artifact["path"],
            "expires_at": artifact["expires_at"],
        }
    ).execute()


def get_scans_for_user(
    supabase: Client, user_id: str, limit: int = 50
) -> List[Dict]:
    """Fetch recent scans for a user, ordered by creation date descending."""
    cleanup_expired_reports(supabase)
    result = (
        supabase.table("scans")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    scans = result.data or []
    scan_ids = [scan["id"] for scan in scans]
    if not scan_ids:
        return scans

    vulns_result = (
        supabase.table("vulnerabilities")
        .select("scan_id,severity,cwe_id,cwe_name,type,line_number,file_path,description,created_at")
        .in_("scan_id", scan_ids)
        .execute()
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
