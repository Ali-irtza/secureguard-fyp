from supabase import Client
from typing import Dict, List
from datetime import datetime, timezone


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
                "started_at": scan_data.get(
                    "started_at", datetime.now(timezone.utc).isoformat()
                ),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
    )
    return result.data[0]["id"]


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
            "code_snippet": "",
        }
        for vuln in vulnerabilities
    ]

    supabase.table("vulnerabilities").insert(rows).execute()


def get_scans_for_user(
    supabase: Client, user_id: str, limit: int = 50
) -> List[Dict]:
    """Fetch recent scans for a user, ordered by creation date descending."""
    result = (
        supabase.table("scans")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


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
