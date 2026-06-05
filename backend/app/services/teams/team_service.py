from fastapi import HTTPException, status
from supabase import Client
from datetime import datetime
from app.models.teams import (
    TeamResponse,
    TeamListResponse,
    TeamMemberResponse,
    MemberProfile,
    TeamRole,
    TeamDashboardResponse,
    TeamDashboardMetrics,
    TeamDashboardMember,
    TeamDashboardScan,
    TeamDashboardTrendPoint,
    TeamDashboardCriticalAlert,
)


EMPTY_SEVERITY_COUNTS = {"critical": 0, "high": 0, "medium": 0, "low": 0}


def _calculate_health_score(counts: dict[str, int]) -> int:
    raw_score = (
        100
        - counts.get("critical", 0) * 2.0
        - counts.get("high", 0) * 1.0
        - counts.get("medium", 0) * 0.5
        - counts.get("low", 0) * 0.25
    )
    clamped = max(0, min(100, raw_score))
    return int(clamped + 0.5)


def _initials(name: str) -> str:
    parts = [part for part in name.replace("@", " ").split() if part]
    if not parts:
        return "U"
    return "".join(part[0] for part in parts).upper()[:2]


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _display_date(value: str | None) -> str:
    parsed = _parse_datetime(value)
    if not parsed:
        return "Unknown"
    return f"{parsed.strftime('%b')} {parsed.day}"


def _scan_date(scan: dict) -> str:
    return scan.get("completed_at") or scan.get("started_at") or scan.get("created_at")


def _project_name(scan: dict, projects_by_id: dict[str, dict]) -> str:
    project = projects_by_id.get(scan.get("project_id") or "")
    return (
        scan.get("project_name")
        or (project.get("name") if project else None)
        or scan.get("file_name")
        or scan.get("branch")
        or "Project"
    )


def _title_for_critical(vuln: dict) -> str:
    label = vuln.get("cwe_id") or vuln.get("type") or vuln.get("cwe_name") or "Critical Issue"
    line = vuln.get("line_number")
    return f"{label} at line {line}" if line else label


def _fetch_vulnerabilities_for_scans(scan_ids: list[str], supabase: Client) -> list[dict]:
    if not scan_ids:
        return []
    result = (
        supabase.table("vulnerabilities")
        .select("id,scan_id,severity,cwe_id,cwe_name,type,line_number,file_path,description,created_at")
        .in_("scan_id", scan_ids)
        .execute()
    )
    return result.data or []


def _counts_by_scan(vulnerabilities: list[dict]) -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = {}
    for vuln in vulnerabilities:
        scan_id = vuln.get("scan_id")
        if not scan_id:
            continue
        severity = str(vuln.get("severity") or "low").lower()
        safe_severity = severity if severity in EMPTY_SEVERITY_COUNTS else "low"
        counts.setdefault(scan_id, EMPTY_SEVERITY_COUNTS.copy())
        counts[scan_id][safe_severity] += 1
    return counts


def _sum_counts(vulnerabilities: list[dict]) -> dict[str, int]:
    counts = EMPTY_SEVERITY_COUNTS.copy()
    for vuln in vulnerabilities:
        severity = str(vuln.get("severity") or "low").lower()
        counts[severity if severity in counts else "low"] += 1
    return counts

def require_admin(team_id: str, user_id: str, supabase: Client) -> None:
    """Raises 403 if the user is not a team admin."""
    result = (
        supabase.table("team_members")
        .select("role")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data or result.data["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team admins can perform this action",
        )

def require_member(team_id: str, user_id: str, supabase: Client) -> dict:
    """Raises 403 if the user is not a member of the team."""
    result = (
        supabase.table("team_members")
        .select("*")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this team",
        )
    return result.data

def build_team_response(team: dict, members: list, current_user_id: str) -> TeamResponse:
    """Assembles a TeamResponse from raw DB rows."""
    current_user_role = TeamRole.viewer
    for m in members:
        if m["user_id"] == current_user_id:
            current_user_role = TeamRole(m["role"])
            break

    member_responses = [
        TeamMemberResponse(
            id=m["id"],
            user_id=m["user_id"],
            role=TeamRole(m["role"]),
            branches=m.get("branches"),
            joined_at=m["created_at"],
            profile=MemberProfile(
                id=m["user_id"],
                full_name=m.get("profiles", {}).get("full_name") if m.get("profiles") else None,
                avatar_url=m.get("profiles", {}).get("avatar_url") if m.get("profiles") else None,
                email=m.get("email"),
            ),
        )
        for m in members
    ]

    return TeamResponse(
        id=team["id"],
        name=team["name"],
        github_repo=team.get("github_repo"),
        github_branches=team.get("github_branches") or [],
        github_installation_id=team.get("github_installation_id"),
        created_by=team["created_by"],
        created_at=team["created_at"],
        updated_at=team["updated_at"],
        current_user_role=current_user_role,
        member_count=len(member_responses),
        members=member_responses,
    )

def fetch_members_for_team(team_id: str, supabase: Client) -> list:
    """
    Fetches members for a single team and enriches with profile data.
    Used by create/update/get operations that work on one team at a time.
    """
    members_result = (
        supabase.table("team_members")
        .select("*")
        .eq("team_id", team_id)
        .execute()
    )
    members = members_result.data or []
    if not members:
        return []

    user_ids = [m["user_id"] for m in members]
    profiles_result = (
        supabase.table("profiles")
        .select("id, full_name, avatar_url")
        .in_("id", user_ids)
        .execute()
    )
    profiles_map = {p["id"]: p for p in (profiles_result.data or [])}

    for m in members:
        m["profiles"] = profiles_map.get(m["user_id"], {})

    return members

def fetch_members_for_teams(team_ids: list[str], supabase: Client) -> dict[str, list]:
    """
    Fetches members for multiple teams in exactly 2 DB round trips:
      1. All team_members rows for all team_ids at once
      2. All profiles for all unique user_ids at once

    Returns a dict keyed by team_id → list of enriched member dicts.
    This replaces the previous N×2 sequential queries in list_user_teams.
    """
    if not team_ids:
        return {}

    members_result = (
        supabase.table("team_members")
        .select("*")
        .in_("team_id", team_ids)
        .execute()
    )
    all_members = members_result.data or []

    if not all_members:
        return {tid: [] for tid in team_ids}

    # Batch-fetch all profiles in one query
    user_ids = list({m["user_id"] for m in all_members})
    profiles_result = (
        supabase.table("profiles")
        .select("id, full_name, avatar_url")
        .in_("id", user_ids)
        .execute()
    )
    profiles_map = {p["id"]: p for p in (profiles_result.data or [])}

    # Attach profile to each member row
    for m in all_members:
        m["profiles"] = profiles_map.get(m["user_id"], {})

    # Group by team_id
    by_team: dict[str, list] = {tid: [] for tid in team_ids}
    for m in all_members:
        tid = m["team_id"]
        if tid in by_team:
            by_team[tid].append(m)

    return by_team

def list_user_teams(user_id: str, supabase: Client) -> TeamListResponse:
    """
    Returns all teams the user belongs to.

    Query plan (was N×2+2 sequential calls, now always 3 total):
      1. team_members  → get team_ids for this user
      2. teams         → fetch all those teams in one query
      3. team_members  → fetch ALL members for ALL teams in one query
         + profiles    → fetch ALL profiles for ALL members in one query
         (steps 3+4 handled by fetch_members_for_teams)
    """
    memberships = (
        supabase.table("team_members")
        .select("team_id")
        .eq("user_id", user_id)
        .execute()
    )
    team_ids = [m["team_id"] for m in (memberships.data or [])]

    if not team_ids:
        return TeamListResponse(teams=[])

    teams_result = (
        supabase.table("teams")
        .select("*")
        .in_("id", team_ids)
        .execute()
    )
    teams = teams_result.data or []

    # Single batched fetch for all members + profiles across all teams
    members_by_team = fetch_members_for_teams(team_ids, supabase)

    team_responses = [
        build_team_response(team, members_by_team.get(team["id"], []), user_id)
        for team in teams
    ]

    return TeamListResponse(teams=team_responses)

def create_new_team(name: str, user_id: str, supabase: Client) -> TeamResponse:
    """Creates a team and makes creator admin."""
    team_result = (
        supabase.table("teams")
        .insert({"name": name, "created_by": user_id})
        .execute()
    )
    team = team_result.data[0]

    supabase.table("team_members").insert({
        "team_id": team["id"],
        "user_id": user_id,
        "role":    "admin",
    }).execute()

    members = fetch_members_for_team(team["id"], supabase)
    return build_team_response(team, members, user_id)

def get_team_by_id(team_id: str, user_id: str, supabase: Client) -> TeamResponse:
    """Returns a single team by ID."""
    require_member(team_id, user_id, supabase)

    team_result = (
        supabase.table("teams")
        .select("*")
        .eq("id", team_id)
        .single()
        .execute()
    )
    if not team_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members = fetch_members_for_team(team_id, supabase)
    return build_team_response(team_result.data, members, user_id)

def update_team_details(team_id: str, user_id: str, name: str | None, github_repo: str | None, supabase: Client) -> TeamResponse:
    """Partial update for a team."""
    require_admin(team_id, user_id, supabase)

    updates = {}
    if name is not None: updates["name"] = name
    if github_repo is not None: updates["github_repo"] = github_repo

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided to update",
        )

    team_result = (
        supabase.table("teams")
        .update(updates)
        .eq("id", team_id)
        .execute()
    )
    if not team_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members = fetch_members_for_team(team_id, supabase)
    return build_team_response(team_result.data[0], members, user_id)

def delete_team_by_id(team_id: str, user_id: str, supabase: Client) -> None:
    """Permanently deletes a team."""
    require_admin(team_id, user_id, supabase)
    supabase.table("teams").delete().eq("id", team_id).execute()


def get_team_dashboard(team_id: str, user_id: str, supabase: Client) -> TeamDashboardResponse:
    """Returns all dashboard data for one team, scoped through team projects."""
    require_member(team_id, user_id, supabase)

    members = fetch_members_for_team(team_id, supabase)
    member_user_ids = [member["user_id"] for member in members]

    projects_result = (
        supabase.table("projects")
        .select("id,name")
        .eq("team_id", team_id)
        .eq("type", "team")
        .execute()
    )
    projects = projects_result.data or []
    project_ids = [project["id"] for project in projects]
    projects_by_id = {project["id"]: project for project in projects}

    scans: list[dict] = []
    if project_ids:
        scans_result = (
            supabase.table("scans")
            .select("*")
            .in_("project_id", project_ids)
            .order("created_at", desc=True)
            .execute()
        )
        scans = scans_result.data or []

    completed_scans = [scan for scan in scans if scan.get("status") == "completed"]
    completed_scan_ids = [scan["id"] for scan in completed_scans]
    all_scan_ids = [scan["id"] for scan in scans]
    completed_vulnerabilities = _fetch_vulnerabilities_for_scans(completed_scan_ids, supabase)
    all_vulnerabilities = _fetch_vulnerabilities_for_scans(all_scan_ids, supabase)
    severity_by_scan = _counts_by_scan(all_vulnerabilities)
    completed_counts = _sum_counts(completed_vulnerabilities)

    profile_names = {
        member["user_id"]: (
            member.get("profiles", {}).get("full_name")
            if member.get("profiles")
            else None
        )
        for member in members
    }

    scans_by_user: dict[str, list[dict]] = {member_id: [] for member_id in member_user_ids}
    for scan in scans:
        scan_user_id = scan.get("user_id")
        if scan_user_id in scans_by_user:
            scans_by_user[scan_user_id].append(scan)

    dashboard_members: list[TeamDashboardMember] = []
    for member in members:
        member_id = member["user_id"]
        assigned_branches = member.get("branches") or member.get("branch") or []
        if isinstance(assigned_branches, str):
            assigned_branches = [assigned_branches]
        member_scans = scans_by_user.get(member_id, [])
        latest_scan = member_scans[0] if member_scans else None
        member_completed_scan_ids = {
            scan["id"] for scan in member_scans if scan.get("status") == "completed"
        }
        member_vulnerabilities = [
            vuln for vuln in all_vulnerabilities if vuln.get("scan_id") in member_completed_scan_ids
        ]
        member_counts = _sum_counts(member_vulnerabilities)
        display_name = profile_names.get(member_id) or member.get("email") or "Team Member"
        branch_label = ", ".join(assigned_branches) if assigned_branches else (latest_scan or {}).get("branch") or "Unassigned"
        dashboard_members.append(
            TeamDashboardMember(
                userId=member_id,
                name=display_name,
                initials=_initials(display_name),
                role=TeamRole(member["role"]),
                branches=assigned_branches,
                branch=branch_label,
                healthScore=_calculate_health_score(member_counts) if member_completed_scan_ids else None,
                lastScanAt=_parse_datetime(_scan_date(latest_scan)) if latest_scan else None,
            )
        )

    recent_scans = [
        TeamDashboardScan(
            id=scan["id"],
            projectName=_project_name(scan, projects_by_id),
            date=_parse_datetime(_scan_date(scan)) or _parse_datetime(scan.get("created_at")),
            status=scan.get("status") or "failed",
            branch=scan.get("branch"),
            memberId=scan.get("user_id"),
            memberName=profile_names.get(scan.get("user_id")) or "Team Member",
            vulnerabilities=severity_by_scan.get(scan["id"], EMPTY_SEVERITY_COUNTS.copy()),
        )
        for scan in scans[:50]
        if _parse_datetime(_scan_date(scan)) or _parse_datetime(scan.get("created_at"))
    ]

    trend_by_date: dict[str, dict[str, int]] = {}
    trend_order: dict[str, datetime] = {}
    completed_scan_map = {scan["id"]: scan for scan in completed_scans}
    for vuln in completed_vulnerabilities:
        severity = str(vuln.get("severity") or "low").lower()
        if severity not in {"critical", "high", "medium"}:
            continue
        scan = completed_scan_map.get(vuln.get("scan_id"))
        if not scan:
            continue
        date_label = _display_date(_scan_date(scan))
        trend_by_date.setdefault(date_label, {"critical": 0, "high": 0, "medium": 0})
        trend_by_date[date_label][severity] += 1
        parsed_scan_date = _parse_datetime(_scan_date(scan))
        if parsed_scan_date and date_label not in trend_order:
            trend_order[date_label] = parsed_scan_date

    sorted_dates = sorted(
        trend_by_date.keys(),
        key=lambda label: trend_order[label].isoformat() if label in trend_order else "",
    )
    vulnerability_trend = [
        TeamDashboardTrendPoint(
            date=date,
            critical=trend_by_date[date]["critical"],
            high=trend_by_date[date]["high"],
            medium=trend_by_date[date]["medium"],
        )
        for date in sorted_dates[-7:]
    ]

    critical_alerts: list[TeamDashboardCriticalAlert] = []
    scan_lookup = {scan["id"]: scan for scan in scans}
    for vuln in sorted(
        [v for v in all_vulnerabilities if str(v.get("severity") or "").lower() == "critical"],
        key=lambda item: item.get("created_at") or "",
        reverse=True,
    ):
        scan = scan_lookup.get(vuln.get("scan_id"))
        if not scan:
            continue
        created_at = _parse_datetime(vuln.get("created_at")) or _parse_datetime(_scan_date(scan))
        if not created_at:
            continue
        critical_alerts.append(
            TeamDashboardCriticalAlert(
                id=vuln["id"],
                title=_title_for_critical(vuln),
                project=_project_name(scan, projects_by_id),
                timeAgo=created_at.isoformat(),
                createdAt=created_at,
                memberName=profile_names.get(scan.get("user_id")) or "Team Member",
                branch=scan.get("branch"),
            )
        )

    return TeamDashboardResponse(
        metrics=TeamDashboardMetrics(
            totalScans=len(completed_scans),
            criticalVulns=completed_counts["critical"],
            healthScore=_calculate_health_score(completed_counts),
        ),
        members=dashboard_members,
        recentScans=recent_scans,
        vulnerabilityTrend=vulnerability_trend,
        criticalAlerts=critical_alerts,
    )
