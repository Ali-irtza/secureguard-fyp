import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { getScanHistory, ScanHistoryItem } from "@/lib/scans-api";
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
import { mockTeams, CURRENT_USER_ID } from "@/lib/team-data";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import type { ScanRecord, AlertRecord } from "@/types/realtime";
import { applyOptimisticInsert, applyOptimisticUpdate, applyOptimisticDelete } from "@/types/realtime";

const Dashboard = () => {
  const [showEmpty] = useState(false);
  const [viewMode, setViewMode] = useState<"personal" | "team">("personal");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [realtimeScans, setRealtimeScans] = useState<ScanRecord[]>([]);
  const prevScansRef = useRef<ScanRecord[]>([]);
  const [realtimeAlerts, setRealtimeAlerts] = useState<AlertRecord[]>([]);
  const prevAlertsRef = useRef<AlertRecord[]>([]);

  // Default team selection: first admin team, or first team
  useEffect(() => {
    if (mockTeams.length > 0) {
      const adminTeam = mockTeams.find((t) => t.currentUserRole === "admin");
      setSelectedTeamId((adminTeam || mockTeams[0]).id);
    }
  }, []);

  // Fetch real scan history from the API
  const { data: rawScans = [] } = useQuery({
    queryKey: ["scan-history"],
    queryFn: getScanHistory,
  });

  // Top 5 most recent scans mapped to the Scan shape RecentScansTable expects
  const recentScans: Scan[] = rawScans
    .filter((s) => Boolean(s.project_name || s.file_name || s.branch))
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      projectName: s.project_name || s.file_name || "Project",
      date: new Date(s.created_at),
      status: (s.status === "completed" ? "completed" : "failed") as Scan["status"],
      vulnerabilities: s.severity_counts ?? { critical: 0, high: 0, medium: 0, low: s.total_vulns ?? 0 },
    }));

  // Stat card values derived from real data
  const totalScans = rawScans.length;
  const criticalVulns = rawScans.reduce((sum, scan) => sum + (scan.severity_counts?.critical ?? 0), 0);
  const completedScans = rawScans.filter((s) => s.status === "completed").length;
  const vulnerabilityTrend = rawScans
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
  const criticalAlerts = rawScans
    .flatMap((scan) =>
      (scan.critical_findings ?? []).map((finding) => ({
        id: finding.id,
        title: `${finding.cwe_id || finding.type || "Critical Issue"}${finding.line_number ? ` at line ${finding.line_number}` : ""}`,
        project: scan.project_name || finding.file_path || "Project",
        timeAgo: new Date(finding.created_at).toLocaleString(),
      }))
    )
    .slice(0, 10);

  const selectedTeam = mockTeams.find((t) => t.id === selectedTeamId);
  const userRole = selectedTeam?.currentUserRole;
  const isTeamView = viewMode === "team" && !!selectedTeam;

  // Real-time subscription for scans — scans.user_id links to auth user
  // team scoping is done via: scans → projects → team_id
  const { status: scansStatus, connectionCount: scansConnectionCount } = useRealtimeSync<ScanRecord>({
    table: "scans",
    enabled: true,
    onInsert: (event) => {
      setRealtimeScans((prev) => applyOptimisticInsert(prev, event.new));
    },
    onUpdate: (event) => {
      setRealtimeScans((prev) => applyOptimisticUpdate(prev, event.new));
    },
  });

  // Real-time subscription for alerts — alerts.user_id links to auth user
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

  // Map ScanRecord → Scan (component prop shape)
  // scans has: file_name, file_path, branch, status, started_at, created_at
  const mapScanRecordToScan = (record: ScanRecord): Scan => ({
    id: record.id,
    projectName: record.file_name ?? record.file_path ?? record.branch ?? record.project_id,
    date: new Date(record.started_at ?? record.created_at),
    status: record.status === "completed" ? "completed" : "failed",
    vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
  });

  // Determine metrics
  const personalMetrics = {
    totalScans,
    criticalVulns,
    healthScore: totalScans > 0 ? Math.round((completedScans / totalScans) * 100) : 100,
  };

  const metrics = isTeamView && selectedTeam ? selectedTeam.metrics : personalMetrics;

  // Determine scans based on role, preferring realtime data when available
  const getScans = (): Scan[] => {
    // Use realtime data if we have any from the subscription
    if (realtimeScans.length > 0) {
      const mapped = realtimeScans.map(mapScanRecordToScan);
      if (!isTeamView || !selectedTeam) return mapped;
      if (userRole === "developer") {
        return realtimeScans
          .filter((s) => s.team_id === selectedTeamId)
          .map(mapScanRecordToScan);
      }
      return mapped;
    }
    // Fall back to real recent scans while realtime hasn't loaded yet
    const normalizeTeamScan = (scan: Scan): Scan => ({
      ...scan,
      status: scan.status === "completed" ? "completed" : "failed",
    });
    if (!isTeamView || !selectedTeam) return recentScans;
    if (userRole === "developer") {
      return selectedTeam.scans.filter((s) => s.memberId === CURRENT_USER_ID).map(normalizeTeamScan);
    }
    return selectedTeam.scans.map(normalizeTeamScan);
  };

  // ---------------------------------------------------------------------------
  // Optimistic mutation handlers — Scans
  // ---------------------------------------------------------------------------

  /** Snapshot current scans state, then apply an optimistic INSERT. */
  const handleOptimisticScanInsert = (record: ScanRecord) => {
    prevScansRef.current = realtimeScans;
    setRealtimeScans((prev) => applyOptimisticInsert(prev, record));
  };

  /** Snapshot current scans state, then apply an optimistic UPDATE. */
  const handleOptimisticScanUpdate = (record: ScanRecord) => {
    prevScansRef.current = realtimeScans;
    setRealtimeScans((prev) => applyOptimisticUpdate(prev, record));
  };

  /** Restore scans to the pre-mutation snapshot and show an error toast. */
  const handleRollbackScans = (errorMessage?: string) => {
    setRealtimeScans(prevScansRef.current);
    toast.error(errorMessage ?? "Scan update failed. Changes have been reverted.");
  };

  // ---------------------------------------------------------------------------
  // Optimistic mutation handlers — Alerts
  // ---------------------------------------------------------------------------

  /** Snapshot current alerts state, then apply an optimistic INSERT. */
  const handleOptimisticAlertInsert = (record: AlertRecord) => {
    prevAlertsRef.current = realtimeAlerts;
    setRealtimeAlerts((prev) => applyOptimisticInsert(prev, record));
  };

  /** Snapshot current alerts state, then apply an optimistic DELETE. */
  const handleOptimisticAlertDelete = (id: string) => {
    prevAlertsRef.current = realtimeAlerts;
    setRealtimeAlerts((prev) => applyOptimisticDelete(prev, id));
  };

  /** Restore alerts to the pre-mutation snapshot and show an error toast. */
  const handleRollbackAlerts = (errorMessage?: string) => {
    setRealtimeAlerts(prevAlertsRef.current);
    toast.error(errorMessage ?? "Alert update failed. Changes have been reverted.");
  };

  // Expose mutation handlers via a plain object — child components can receive
  // these as props when they need to trigger mutations with optimistic updates.
  const scanMutationHandlers = {
    onOptimisticInsert: handleOptimisticScanInsert,
    onOptimisticUpdate: handleOptimisticScanUpdate,
    onRollback: handleRollbackScans,
  };

  const alertMutationHandlers = {
    onOptimisticInsert: handleOptimisticAlertInsert,
    onOptimisticDelete: handleOptimisticAlertDelete,
    onRollback: handleRollbackAlerts,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Monitor your security posture at a glance
            </p>
          </div>
        </div>

        {/* Team View Toggle */}
        {mockTeams.length > 0 && (
          <TeamViewToggle
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            teams={mockTeams}
            selectedTeamId={selectedTeamId}
            onTeamChange={setSelectedTeamId}
          />
        )}

        {/* Metrics Row */}
        <MetricsRow {...metrics} isTeamView={isTeamView} />

        {/* Team Health Overview - only in team view */}
        {isTeamView && selectedTeam && userRole && (
          <TeamHealthOverview
            team={selectedTeam}
            currentUserId={CURRENT_USER_ID}
            userRole={userRole}
          />
        )}

        {/* Main Content */}
        {showEmpty ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - 2/3 width */}
            <div className="lg:col-span-2 space-y-6">
              <RecentScansTable
                scans={getScans()}
                userRole={isTeamView ? userRole : undefined}
              />
              {/* Bar Chart and Pie Chart */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <VulnerabilityBarChart data={Array.from(vulnerabilityTrend.values()).slice(-7)} />
                <VulnerabilityPieChart data={Array.from(vulnerabilityTrend.values()).slice(-7)} />
              </div>
            </div>

            {/* Right Column - 1/3 width */}
            <div className="space-y-6">
              <VulnerabilityChart data={Array.from(vulnerabilityTrend.values()).slice(-7)} />
              <CriticalAlerts
                isTeamView={isTeamView}
                teamAlerts={isTeamView && selectedTeam ? selectedTeam.alerts : undefined}
                userRole={isTeamView ? userRole : undefined}
                realtimeAlerts={realtimeAlerts.length > 0 ? realtimeAlerts : undefined}
                scanAlerts={criticalAlerts}
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
