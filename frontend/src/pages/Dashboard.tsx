import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import MetricsRow from "@/components/dashboard/MetricsRow";
import EmptyState from "@/components/dashboard/EmptyState";
import RecentScansTable, { Scan } from "@/components/dashboard/RecentScansTable";
import VulnerabilityChart from "@/components/dashboard/VulnerabilityChart";
import VulnerabilityBarChart from "@/components/dashboard/VulnerabilityBarChart";
import VulnerabilityPieChart from "@/components/dashboard/VulnerabilityPieChart";
import CriticalAlerts from "@/components/dashboard/CriticalAlerts";
import TeamViewToggle from "@/components/dashboard/TeamViewToggle";
import TeamHealthOverview from "@/components/dashboard/TeamHealthOverview";
import { getScanHistory } from "@/lib/scans-api";
import { getTeamDashboard, listTeams } from "@/lib/teams-api";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { AlertRecord } from "@/types/realtime";
import { applyOptimisticInsert, applyOptimisticUpdate, applyOptimisticDelete } from "@/types/realtime";

const emptySeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

const formatTimeAgo = (isoString: string): string => {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
};

const Dashboard = () => {
  const [showEmpty] = useState(false);
  const [viewMode, setViewMode] = useState<"personal" | "team">("personal");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [realtimeAlerts, setRealtimeAlerts] = useState<AlertRecord[]>([]);
  const { user } = useCurrentUser();

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
  });

  useEffect(() => {
    if (teams.length === 0) {
      setSelectedTeamId("");
      return;
    }
    if (selectedTeamId && teams.some((team) => team.id === selectedTeamId)) return;
    const adminTeam = teams.find((team) => team.current_user_role === "admin");
    setSelectedTeamId((adminTeam || teams[0]).id);
  }, [selectedTeamId, teams]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId);
  const userRole = selectedTeam?.current_user_role;
  const isTeamView = viewMode === "team" && !!selectedTeam;

  const { data: rawScans = [] } = useQuery({
    queryKey: ["scan-history"],
    queryFn: getScanHistory,
  });

  const { data: teamDashboard } = useQuery({
    queryKey: ["team-dashboard", selectedTeamId],
    queryFn: () => getTeamDashboard(selectedTeamId),
    enabled: isTeamView && !!selectedTeamId,
  });

  const { status: alertsStatus, connectionCount: alertsConnectionCount } = useRealtimeSync<AlertRecord>({
    table: "alerts",
    enabled: true,
    onInsert: (event) => {
      setRealtimeAlerts((prev) => applyOptimisticInsert(prev, event.new));
    },
    onUpdate: (event) => {
      setRealtimeAlerts((prev) => applyOptimisticUpdate(prev, event.new));
    },
    onDelete: (event) => {
      setRealtimeAlerts((prev) => applyOptimisticDelete(prev, event.old.id ?? ""));
    },
  });

  const personalRecentScans: Scan[] = useMemo(() => {
    return rawScans
      .filter((scan) => Boolean(scan.project_name || scan.file_name || scan.branch))
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map((scan) => ({
        id: scan.id,
        projectName: scan.project_name || scan.file_name || "Project",
        date: new Date(scan.created_at),
        status: (scan.status === "completed" ? "completed" : "failed") as Scan["status"],
        vulnerabilities: scan.severity_counts ?? { ...emptySeverityCounts, low: scan.total_vulns ?? 0 },
      }));
  }, [rawScans]);

  const personalTrend = useMemo(() => {
    const trend = rawScans
      .filter((scan) => scan.status === "completed")
      .reduce((acc, scan) => {
        const date = new Date(scan.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const current = acc.get(date) ?? { date, critical: 0, high: 0, medium: 0 };
        current.critical += scan.severity_counts?.critical ?? 0;
        current.high += scan.severity_counts?.high ?? 0;
        current.medium += scan.severity_counts?.medium ?? 0;
        acc.set(date, current);
        return acc;
      }, new Map<string, { date: string; critical: number; high: number; medium: number }>());

    return Array.from(trend.values()).slice(-7);
  }, [rawScans]);

  const personalCriticalAlerts = useMemo(() => {
    return rawScans
      .flatMap((scan) =>
        (scan.critical_findings ?? []).map((finding) => ({
          id: finding.id,
          title: `${finding.cwe_id || finding.type || "Critical Issue"}${finding.line_number ? ` at line ${finding.line_number}` : ""}`,
          project: scan.project_name || finding.file_path || "Project",
          timeAgo: new Date(finding.created_at).toLocaleString(),
        }))
      )
      .slice(0, 10);
  }, [rawScans]);

  const teamRecentScans: Scan[] = useMemo(() => {
    return (teamDashboard?.recentScans ?? []).map((scan) => ({
      id: scan.id,
      projectName: scan.projectName,
      date: new Date(scan.date),
      status: (scan.status === "completed" ? "completed" : "failed") as Scan["status"],
      vulnerabilities: scan.vulnerabilities,
      memberId: scan.memberId ?? undefined,
    }));
  }, [teamDashboard?.recentScans]);

  const teamCriticalAlerts = useMemo(() => {
    return (teamDashboard?.criticalAlerts ?? []).map((alert) => ({
      id: alert.id,
      title: alert.title,
      project: alert.project,
      timeAgo: formatTimeAgo(alert.createdAt || alert.timeAgo),
      memberName: alert.memberName,
      branch: alert.branch,
    }));
  }, [teamDashboard?.criticalAlerts]);

  const totalScans = rawScans.length;
  const criticalVulns = rawScans.reduce((sum, scan) => sum + (scan.severity_counts?.critical ?? 0), 0);
  const completedScans = rawScans.filter((scan) => scan.status === "completed").length;

  const personalMetrics = {
    totalScans,
    criticalVulns,
    healthScore: totalScans > 0 ? Math.round((completedScans / totalScans) * 100) : 100,
  };

  const metrics = isTeamView && teamDashboard ? teamDashboard.metrics : personalMetrics;
  const scans = isTeamView ? teamRecentScans : personalRecentScans;
  const chartData = isTeamView ? teamDashboard?.vulnerabilityTrend ?? [] : personalTrend;
  const alerts = isTeamView ? teamCriticalAlerts : personalCriticalAlerts;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Monitor your security posture at a glance
            </p>
          </div>
        </div>

        {teams.length > 0 && (
          <TeamViewToggle
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            teams={teams}
            selectedTeamId={selectedTeamId}
            onTeamChange={setSelectedTeamId}
          />
        )}

        <MetricsRow {...metrics} isTeamView={isTeamView} />

        {isTeamView && selectedTeam && userRole && teamDashboard && (
          <TeamHealthOverview
            teamName={selectedTeam.name}
            members={teamDashboard.members}
            currentUserId={user?.id ?? ""}
            userRole={userRole}
          />
        )}

        {showEmpty ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <RecentScansTable
                scans={scans}
                userRole={isTeamView ? userRole : undefined}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <VulnerabilityBarChart data={chartData} />
                <VulnerabilityPieChart data={chartData} />
              </div>
            </div>

            <div className="space-y-6">
              <VulnerabilityChart data={chartData} />
              <CriticalAlerts
                isTeamView={isTeamView}
                userRole={isTeamView ? userRole : undefined}
                realtimeAlerts={!isTeamView && realtimeAlerts.length > 0 ? realtimeAlerts : undefined}
                scanAlerts={alerts}
                connectionStatus={{ status: alertsStatus, connectionCount: alertsConnectionCount }}
              />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
