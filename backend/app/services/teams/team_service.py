from datetime import datetime
from fastapi import HTTPException, status
from supabase import Client
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
SEVERITY_WEIGHTS = {"critical": 10, "high": 6, "medium": 3, "low": 1}
MAX_WEIGHTED_RISK = 150


def _is_missing_table_error(exc: Exception) -> bool:
    message = str(exc)
    return "PGRST205" in message or "Could not find the table" in message


def _calculate_health_score(counts: dict[str, int]) -> int:
    weighted_risk = (
        counts.get("critical", 0) * SEVERITY_WEIGHTS["critical"]
        + counts.get("high", 0) * SEVERITY_WEIGHTS["high"]
        + counts.get("medium", 0) * SEVERITY_WEIGHTS["medium"]
        + counts.get("low", 0) * SEVERITY_WEIGHTS["low"]
    )
    risk_percent = min(100, round((weighted_risk / MAX_WEIGHTED_RISK) * 100))
    return max(0, 100 - risk_percent)


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


def _scan_date(scan: dict) -> str | None:
    return scan.get("completed_at") or scan.get("started_at") or scan.get("created_at")


def _member_branches(member: dict) -> list[str]:
    assigned_branch = member.get("assigned_branch")
    if not assigned_branch:
        return []
    if isinstance(assigned_branch, list):
        return [branch for branch in assigned_branch if branch]
    return [assigned_branch]


def _profile_map(user_ids: list[str], supabase: Client) -> dict[str, dict]:
    ids = list({user_id for user_id in user_ids if user_id})
    if not ids:
        return {}
    try:
        result = (
            supabase.table("profiles")
            .select("user_id, full_name, avatar_url, email")
            .in_("user_id", ids)
            .execute()
        )
        return {profile["user_id"]: profile for profile in (result.data or [])}
    except Exception:
        result = (
            supabase.table("profiles")
            .select("id, full_name, avatar_url, email")
            .in_("id", ids)
            .execute()
        )
        return {
            profile["id"]: {
                **profile,
                "user_id": profile["id"],
            }
            for profile in (result.data or [])
        }


def _member_response(member: dict, profile: dict | None) -> TeamMemberResponse:
    profile = profile or {}
    return TeamMemberResponse(
        id=member["team_member_id"],
        user_id=member["user_id"],
        role=TeamRole(member["assigned_role"]),
        branches=_member_branches(member),
        joined_at=member["joined_at"],
        profile=MemberProfile(
            id=member["user_id"],
            full_name=profile.get("full_name"),
            avatar_url=profile.get("avatar_url"),
            email=profile.get("email"),
        ),
    )


def build_team_response(team: dict, members: list, current_user_id: str) -> TeamResponse:
    current_user_role = TeamRole.viewer
    for member in members:
        if member["user_id"] == current_user_id:
            current_user_role = TeamRole(member["assigned_role"])
            break

    member_responses = [
        _member_response(member, member.get("profile"))
        for member in members
    ]

    return TeamResponse(
        id=team["team_id"],
        name=team["team_name"],
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
    result = (
        supabase.table("team_members")
        .select("*")
        .eq("team_id", team_id)
        .eq("status", "active")
        .order("joined_at")
        .execute()
    )
    members = result.data or []
    profiles = _profile_map([member["user_id"] for member in members], supabase)
    for member in members:
        member["profile"] = profiles.get(member["user_id"], {})
    return members


def fetch_members_for_teams(team_ids: list[str], supabase: Client) -> dict[str, list]:
    if not team_ids:
        return {}

    result = (
        supabase.table("team_members")
        .select("*")
        .in_("team_id", team_ids)
        .eq("status", "active")
        .order("joined_at")
        .execute()
    )
    all_members = result.data or []
    profiles = _profile_map([member["user_id"] for member in all_members], supabase)
    by_team = {team_id: [] for team_id in team_ids}
    for member in all_members:
        member["profile"] = profiles.get(member["user_id"], {})
        by_team.setdefault(member["team_id"], []).append(member)
    return by_team


def require_member(team_id: str, user_id: str, supabase: Client) -> dict:
    result = (
        supabase.table("team_members")
        .select("*")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    member = (result.data or [None])[0]
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this team",
        )
    return {
        "id": member["team_member_id"],
        "team_id": member["team_id"],
        "user_id": member["user_id"],
        "role": member["assigned_role"],
        "branches": _member_branches(member),
        "raw": member,
    }


def require_admin(team_id: str, user_id: str, supabase: Client) -> None:
    member = require_member(team_id, user_id, supabase)
    if member["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team admins can perform this action",
        )


def link_project_to_team(team_id: str, project_id: str, user_id: str, supabase: Client) -> None:
    member = require_member(team_id, user_id, supabase)
    if member["role"] == "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Viewers cannot link projects to a team scan.",
        )

    project_result = (
        supabase.table("projects")
        .select("project_id, user_id, project_type")
        .eq("project_id", project_id)
        .limit(1)
        .execute()
    )
    project = (project_result.data or [None])[0]
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if project.get("user_id") != user_id and member["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the project owner or a team admin can link this project to the team.",
        )

    if project.get("project_type") != "team":
        supabase.table("projects").update({"project_type": "team"}).eq("project_id", project_id).execute()

    team_update = (
        supabase.table("team")
        .update({"project_id": project_id})
        .eq("team_id", team_id)
        .execute()
    )
    if not team_update.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")


def list_user_teams(user_id: str, supabase: Client) -> TeamListResponse:
    try:
        memberships = (
            supabase.table("team_members")
            .select("team_id")
            .eq("user_id", user_id)
            .eq("status", "active")
            .execute()
        )
    except Exception as exc:
        if _is_missing_table_error(exc):
            return TeamListResponse(teams=[])
        raise

    team_ids = [membership["team_id"] for membership in (memberships.data or [])]
    if not team_ids:
        return TeamListResponse(teams=[])

    teams_result = (
        supabase.table("team")
        .select("*")
        .in_("team_id", team_ids)
        .order("created_at", desc=True)
        .execute()
    )
    teams = teams_result.data or []
    members_by_team = fetch_members_for_teams(team_ids, supabase)
    return TeamListResponse(
        teams=[
            build_team_response(team, members_by_team.get(team["team_id"], []), user_id)
            for team in teams
        ]
    )


def create_new_team(name: str, user_id: str, supabase: Client) -> TeamResponse:
    team_result = (
        supabase.table("team")
        .insert({"team_name": name, "created_by": user_id})
        .execute()
    )
    team = team_result.data[0]

    supabase.table("team_members").insert(
        {
            "team_id": team["team_id"],
            "user_id": user_id,
            "assigned_role": "admin",
            "status": "active",
        }
    ).execute()

    members = fetch_members_for_team(team["team_id"], supabase)
    return build_team_response(team, members, user_id)


def get_team_by_id(team_id: str, user_id: str, supabase: Client) -> TeamResponse:
    require_member(team_id, user_id, supabase)
    team_result = (
        supabase.table("team")
        .select("*")
        .eq("team_id", team_id)
        .limit(1)
        .execute()
    )
    team = (team_result.data or [None])[0]
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members = fetch_members_for_team(team_id, supabase)
    return build_team_response(team, members, user_id)


def update_team_details(team_id: str, user_id: str, name: str | None, github_repo: str | None, supabase: Client) -> TeamResponse:
    require_admin(team_id, user_id, supabase)

    updates = {}
    if name is not None:
        updates["team_name"] = name
    if github_repo is not None:
        updates["github_repo"] = github_repo or None
        if not github_repo:
            updates["github_branches"] = []
            updates["github_installation_id"] = None
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided to update")

    team_result = (
        supabase.table("team")
        .update(updates)
        .eq("team_id", team_id)
        .execute()
    )
    team = (team_result.data or [None])[0]
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members = fetch_members_for_team(team_id, supabase)
    return build_team_response(team, members, user_id)


def delete_team_by_id(team_id: str, user_id: str, supabase: Client) -> None:
    require_admin(team_id, user_id, supabase)
    supabase.table("team").delete().eq("team_id", team_id).execute()


def _project_name(project: dict | None) -> str:
    if not project:
        return "Team Project"
    return project.get("project_name") or project.get("name") or "Team Project"


def _scan_counts(scans: list[dict], supabase: Client) -> dict[str, dict[str, int]]:
    scan_ids = [scan["scan_id"] for scan in scans if scan.get("scan_id")]
    if not scan_ids:
        return {}
    result = (
        supabase.table("scan_results")
        .select("scan_id, critical_count, high_count, medium_count, low_count")
        .in_("scan_id", scan_ids)
        .execute()
    )
    return {
        row["scan_id"]: {
            "critical": row.get("critical_count") or 0,
            "high": row.get("high_count") or 0,
            "medium": row.get("medium_count") or 0,
            "low": row.get("low_count") or 0,
        }
        for row in (result.data or [])
    }


def _project_ids_for_team(team: dict | None, members: list[dict], supabase: Client) -> tuple[dict[str, dict], list[str]]:
    if not team:
        return {}, []

    member_ids = [member["user_id"] for member in members if member.get("user_id")]
    projects_by_id: dict[str, dict] = {}

    if team.get("project_id"):
        linked_project = (
            supabase.table("projects")
            .select("*")
            .eq("project_id", team["project_id"])
            .execute()
        )
        for project in linked_project.data or []:
            projects_by_id[project["project_id"]] = project

    team_projects = (
        supabase.table("projects")
        .select("*")
        .eq("project_type", "team")
        .execute()
    )
    for project in team_projects.data or []:
        if project.get("project_id") in projects_by_id:
            continue
        if project.get("user_id") in member_ids:
            projects_by_id[project["project_id"]] = project
            continue
        if project.get("team_id") == team.get("team_id") or project.get("created_by") == team.get("team_id"):
            projects_by_id[project["project_id"]] = project
            continue
        if team.get("github_repo") and project.get("github_repo") == team.get("github_repo") and project.get("user_id") in member_ids:
            projects_by_id[project["project_id"]] = project

    if team.get("github_repo") and member_ids:
        repo_projects = (
            supabase.table("projects")
            .select("*")
            .eq("github_repo", team["github_repo"])
            .in_("user_id", member_ids)
            .order("created_at", desc=True)
            .execute()
        )
        for project in repo_projects.data or []:
            project_name = str(project.get("project_name") or "").lower()
            if project.get("project_type") == "team" or "team" in project_name:
                projects_by_id[project["project_id"]] = project

    return projects_by_id, list(projects_by_id.keys())


def _team_alerts(
    team_id: str,
    project_by_id: dict[str, dict],
    scans: list[dict],
    counts_by_scan: dict[str, dict[str, int]],
    profile_by_user: dict[str, dict],
    supabase: Client,
) -> list[TeamDashboardCriticalAlert]:
    scan_by_id = {scan["scan_id"]: scan for scan in scans if scan.get("scan_id")}
    scan_ids = list(scan_by_id.keys())
    alerts: list[TeamDashboardCriticalAlert] = []

    if scan_ids:
        try:
            alert_rows = (
                supabase.table("alerts")
                .select("id, scan_id, team_id, user_id, message, status, created_at")
                .in_("scan_id", scan_ids)
                .execute()
            )
            for alert in alert_rows.data or []:
                if alert.get("team_id") and alert.get("team_id") != team_id:
                    continue
                if alert.get("status") not in {None, "open"}:
                    continue
                scan = scan_by_id.get(alert.get("scan_id") or "")
                project = project_by_id.get((scan or {}).get("project_id") or "")
                profile = profile_by_user.get(alert.get("user_id") or (scan or {}).get("user_id") or "", {})
                created_at = _parse_datetime(alert.get("created_at")) or datetime.now()
                alerts.append(
                    TeamDashboardCriticalAlert(
                        id=alert.get("id") or f"alert-{alert.get('scan_id')}",
                        title=alert.get("message") or "Critical issue detected",
                        project=_project_name(project),
                        timeAgo=_display_date(alert.get("created_at")),
                        createdAt=created_at,
                        memberName=profile.get("full_name") or profile.get("email"),
                        branch=None,
                    )
                )
        except Exception:
            alerts = []

    if alerts:
        return sorted(alerts, key=lambda alert: alert.createdAt, reverse=True)[:10]

    for scan in scans:
        counts = counts_by_scan.get(scan.get("scan_id") or "", EMPTY_SEVERITY_COUNTS)
        if counts.get("critical", 0) <= 0:
            continue
        project = project_by_id.get(scan.get("project_id") or "")
        profile = profile_by_user.get(scan.get("user_id") or "", {})
        created_at = _parse_datetime(_scan_date(scan)) or datetime.now()
        alerts.append(
            TeamDashboardCriticalAlert(
                id=f"scan-critical-{scan['scan_id']}",
                title=f"{counts['critical']} critical issue{counts['critical'] == 1 and '' or 's'}",
                project=_project_name(project),
                timeAgo=_display_date(_scan_date(scan)),
                createdAt=created_at,
                memberName=profile.get("full_name") or profile.get("email"),
                branch=None,
            )
        )
    return sorted(alerts, key=lambda alert: alert.createdAt, reverse=True)[:10]


def get_team_dashboard(team_id: str, user_id: str, supabase: Client) -> TeamDashboardResponse:
    require_member(team_id, user_id, supabase)
    team_result = (
        supabase.table("team")
        .select("*")
        .eq("team_id", team_id)
        .limit(1)
        .execute()
    )
    team = (team_result.data or [None])[0]
    members = fetch_members_for_team(team_id, supabase)
    project_by_id, project_ids = _project_ids_for_team(team, members, supabase)
    scans = []
    if project_ids:
        scans_result = (
            supabase.table("scan")
            .select("*")
            .in_("project_id", project_ids)
            .order("created_at", desc=True)
            .execute()
        )
        scans = scans_result.data or []

    counts_by_scan = _scan_counts(scans, supabase)
    completed_scans = [scan for scan in scans if scan.get("completion_status") == "completed"]
    completed_counts = EMPTY_SEVERITY_COUNTS.copy()
    for scan in completed_scans:
        counts = counts_by_scan.get(scan["scan_id"], EMPTY_SEVERITY_COUNTS)
        for severity in completed_counts:
            completed_counts[severity] += counts.get(severity, 0)

    member_completed_counts: dict[str, dict[str, int]] = {}
    member_last_scan: dict[str, datetime] = {}
    for scan in completed_scans:
        scan_user_id = scan.get("user_id")
        if not scan_user_id:
            continue
        member_counts = member_completed_counts.setdefault(scan_user_id, EMPTY_SEVERITY_COUNTS.copy())
        counts = counts_by_scan.get(scan["scan_id"], EMPTY_SEVERITY_COUNTS)
        for severity in member_counts:
            member_counts[severity] += counts.get(severity, 0)
        scan_date = _parse_datetime(_scan_date(scan))
        if scan_date and (scan_user_id not in member_last_scan or scan_date > member_last_scan[scan_user_id]):
            member_last_scan[scan_user_id] = scan_date

    profile_by_user = {
        member["user_id"]: member.get("profile") or {}
        for member in members
    }

    dashboard_members = []
    for member in members:
        profile = member.get("profile") or {}
        name = profile.get("full_name") or profile.get("email") or "Team Member"
        branches = _member_branches(member)
        dashboard_members.append(
            TeamDashboardMember(
                userId=member["user_id"],
                name=name,
                initials=_initials(name),
                role=TeamRole(member["assigned_role"]),
                branches=branches,
                branch=", ".join(branches) if branches else "All team branches" if member["assigned_role"] == "admin" else "Unassigned",
                healthScore=_calculate_health_score(member_completed_counts[member["user_id"]]) if member["user_id"] in member_completed_counts else None,
                lastScanAt=member_last_scan[member["user_id"]] if member["user_id"] in member_last_scan else None,
            )
        )

    recent_scans = []
    for scan in scans[:50]:
        date = _parse_datetime(_scan_date(scan))
        if not date:
            continue
        project = project_by_id.get(scan.get("project_id") or "")
        profile = profile_by_user.get(scan.get("user_id") or "", {})
        recent_scans.append(
            TeamDashboardScan(
                id=scan["scan_id"],
                projectName=_project_name(project),
                date=date,
                status=scan.get("completion_status") or "failed",
                branch=None,
                memberId=scan.get("user_id"),
                memberName=profile.get("full_name") or profile.get("email") or "Team Member",
                vulnerabilities=counts_by_scan.get(scan["scan_id"], EMPTY_SEVERITY_COUNTS.copy()),
            )
        )

    trend_by_date: dict[str, dict[str, int]] = {}
    trend_order: dict[str, datetime] = {}
    for scan in completed_scans:
        date_value = _scan_date(scan)
        date_label = _display_date(date_value)
        trend_by_date.setdefault(date_label, {"critical": 0, "high": 0, "medium": 0})
        counts = counts_by_scan.get(scan["scan_id"], EMPTY_SEVERITY_COUNTS)
        trend_by_date[date_label]["critical"] += counts.get("critical", 0)
        trend_by_date[date_label]["high"] += counts.get("high", 0)
        trend_by_date[date_label]["medium"] += counts.get("medium", 0)
        parsed = _parse_datetime(date_value)
        if parsed:
            trend_order[date_label] = parsed

    sorted_dates = sorted(
        trend_by_date.keys(),
        key=lambda label: trend_order[label].timestamp() if label in trend_order else 0,
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

    return TeamDashboardResponse(
        metrics=TeamDashboardMetrics(
            totalScans=len(scans),
            criticalVulns=completed_counts["critical"],
            healthScore=_calculate_health_score(completed_counts),
        ),
        members=dashboard_members,
        recentScans=recent_scans,
        vulnerabilityTrend=vulnerability_trend,
        criticalAlerts=_team_alerts(team_id, project_by_id, scans, counts_by_scan, profile_by_user, supabase),
    )
