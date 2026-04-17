import { useState, useEffect } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import MetricsRow from "@/components/dashboard/MetricsRow";
import EmptyState from "@/components/dashboard/EmptyState";
import RecentScansTable, { Scan } from "@/components/dashboard/RecentScansTable";
import VulnerabilityChart from "@/components/dashboard/VulnerabilityChart";
import CriticalAlerts from "@/components/dashboard/CriticalAlerts";
import TeamViewToggle from "@/components/dashboard/TeamViewToggle";
import TeamHealthOverview from "@/components/dashboard/TeamHealthOverview";
import { mockTeams, CURRENT_USER_ID } from "@/lib/team-data";

// Mock data for demonstration
const mockScans: Scan[] = [
  {
    id: "1",
    projectName: "frontend-app",
    date: new Date(Date.now() - 1000 * 60 * 30),
    status: "completed",
    vulnerabilities: { critical: 2, high: 5, medium: 12, low: 23 },
  },
  {
    id: "2",
    projectName: "api-gateway",
    date: new Date(Date.now() - 1000 * 60 * 60 * 2),
    status: "in_progress",
    vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
  },
  {
    id: "3",
    projectName: "auth-service",
    date: new Date(Date.now() - 1000 * 60 * 60 * 5),
    status: "completed",
    vulnerabilities: { critical: 1, high: 3, medium: 8, low: 15 },
  },
  {
    id: "4",
    projectName: "payment-module",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24),
    status: "failed",
    vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
  },
  {
    id: "5",
    projectName: "admin-panel",
    date: new Date(Date.now() - 1000 * 60 * 60 * 48),
    status: "completed",
    vulnerabilities: { critical: 0, high: 2, medium: 6, low: 11 },
  },
];

const Dashboard = () => {
  const [showEmpty] = useState(false);
  const [viewMode, setViewMode] = useState<"personal" | "team">("personal");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  // Default team selection: first admin team, or first team
  useEffect(() => {
    if (mockTeams.length > 0) {
      const adminTeam = mockTeams.find((t) => t.currentUserRole === "admin");
      setSelectedTeamId((adminTeam || mockTeams[0]).id);
    }
  }, []);

  const selectedTeam = mockTeams.find((t) => t.id === selectedTeamId);
  const userRole = selectedTeam?.currentUserRole;
  const isTeamView = viewMode === "team" && !!selectedTeam;

  // Determine metrics
  const personalMetrics = {
    totalScans: 247,
    criticalVulns: 12,
    healthScore: 87,
    pendingScans: 3,
  };

  const metrics = isTeamView && selectedTeam ? selectedTeam.metrics : personalMetrics;

  // Determine scans based on role
  const getScans = (): Scan[] => {
    if (!isTeamView || !selectedTeam) return mockScans;
    if (userRole === "developer") {
      return selectedTeam.scans.filter((s) => s.memberId === CURRENT_USER_ID);
    }
    return selectedTeam.scans;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
            <div className="lg:col-span-2">
              <RecentScansTable
                scans={getScans()}
                userRole={isTeamView ? userRole : undefined}
              />
            </div>

            {/* Right Column - 1/3 width */}
            <div className="space-y-6">
              <VulnerabilityChart />
              <CriticalAlerts
                isTeamView={isTeamView}
                teamAlerts={isTeamView && selectedTeam ? selectedTeam.alerts : undefined}
                userRole={isTeamView ? userRole : undefined}
              />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
