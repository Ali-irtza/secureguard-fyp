import type { ScanHistoryItem } from "@/lib/scans-api";
import type { Project } from "@/lib/projects-api";
import type { Team, TeamDashboardScan } from "@/lib/teams-api";

export type NotificationType = "critical" | "warning" | "info" | "success";

export interface NotificationPreferences {
  criticalAlerts: boolean;
  scanCompleted: boolean;
  newProject: boolean;
  teamMemberScanned: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
}

const PREFS_KEY = "secureguard_notification_preferences";
const LOCAL_NOTIFICATIONS_KEY = "secureguard_notifications";

export const defaultNotificationPreferences: NotificationPreferences = {
  criticalAlerts: true,
  scanCompleted: true,
  newProject: true,
  teamMemberScanned: true,
};

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return defaultNotificationPreferences;
  const raw = window.localStorage.getItem(PREFS_KEY);
  if (!raw) return defaultNotificationPreferences;
  try {
    return { ...defaultNotificationPreferences, ...JSON.parse(raw) };
  } catch {
    return defaultNotificationPreferences;
  }
}

export function saveNotificationPreferences(preferences: NotificationPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new CustomEvent("secureguard:notification-preferences"));
}

export function getLocalNotifications(): AppNotification[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(LOCAL_NOTIFICATIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as AppNotification[];
  } catch {
    return [];
  }
}

export function addLocalNotification(notification: Omit<AppNotification, "id" | "createdAt" | "read"> & { createdAt?: string }): AppNotification {
  const item: AppNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: notification.createdAt ?? new Date().toISOString(),
    read: false,
    ...notification,
  };
  if (typeof window !== "undefined") {
    const next = [item, ...getLocalNotifications()].slice(0, 50);
    window.localStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("secureguard:notifications"));
  }
  return item;
}

export function formatTimeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (!Number.isFinite(diffMs)) return "";
  const mins = Math.max(0, Math.floor(diffMs / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function buildNotifications(params: {
  scans: ScanHistoryItem[];
  projects: Project[];
  teams: Team[];
  preferences: NotificationPreferences;
  localNotifications?: AppNotification[];
  currentUserId?: string;
  teamScans?: TeamDashboardScan[];
}): AppNotification[] {
  const { scans, projects, teams, preferences, localNotifications = [], currentUserId, teamScans = [] } = params;
  const notifications: AppNotification[] = [...localNotifications];

  if (preferences.criticalAlerts) {
    for (const scan of scans) {
      for (const finding of scan.critical_findings ?? []) {
        notifications.push({
          id: `critical-${finding.id}`,
          title: "Critical vulnerability found",
          description: `${finding.cwe_id || finding.type || "Critical issue"} in ${scan.project_name || finding.file_path || "scan"}`,
          type: "critical",
          createdAt: finding.created_at || scan.created_at,
          read: false,
        });
      }
    }
  }

  if (preferences.scanCompleted) {
    for (const scan of scans.filter((item) => item.status === "completed")) {
      notifications.push({
        id: `scan-${scan.id}`,
        title: "Scan completed",
        description: `${scan.project_name || scan.file_name || "Security scan"} finished`,
        type: scan.total_vulns && scan.total_vulns > 0 ? "warning" : "success",
        createdAt: scan.completed_at || scan.created_at,
        read: false,
      });
    }
  }

  if (preferences.newProject) {
    for (const project of projects.slice(0, 20)) {
      notifications.push({
        id: `project-${project.id}`,
        title: "New project added",
        description: `${project.name} was added`,
        type: "info",
        createdAt: project.created_at,
        read: false,
      });
    }
  }

  if (preferences.teamMemberScanned) {
    for (const scan of teamScans.filter((item) => item.status === "completed")) {
      notifications.push({
        id: `team-scan-${scan.id}`,
        title: "Team member finished scan",
        description: `${scan.memberName || "Team member"} finished ${scan.projectName}${scan.branch ? ` on ${scan.branch}` : ""}`,
        type: scan.vulnerabilities.critical > 0 ? "critical" : scan.vulnerabilities.high > 0 ? "warning" : "success",
        createdAt: scan.date,
        read: false,
      });
    }

    for (const team of teams) {
      const member = team.members.find((item) => item.user_id === currentUserId);
      const branchInfo = member?.branches?.length ? ` (${member.branches.join(", ")})` : "";
      notifications.push({
        id: `team-${team.id}-${team.updated_at}`,
        title: "Team activity",
        description: `${team.name}: you are ${team.current_user_role}${branchInfo}`,
        type: "info",
        createdAt: team.updated_at || team.created_at,
        read: false,
      });
    }
  }

  const unique = new Map<string, AppNotification>();
  for (const notification of notifications) {
    unique.set(notification.id, notification);
  }
  return Array.from(unique.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);
}
