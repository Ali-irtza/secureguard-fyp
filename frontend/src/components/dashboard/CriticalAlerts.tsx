import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { TeamAlert } from "@/lib/team-data";
import type { AlertRecord, SubscriptionStatus } from "@/types/realtime";
import ConnectionStatus from "@/components/dashboard/ConnectionStatus";

interface Alert {
  id: string;
  title: string;
  project: string;
  timeAgo: string;
}

interface CriticalAlertsProps {
  teamAlerts?: TeamAlert[];
  isTeamView?: boolean;
  userRole?: "admin" | "developer" | "viewer";
  realtimeAlerts?: AlertRecord[];
  scanAlerts?: Alert[];
  connectionStatus?: { status: SubscriptionStatus; connectionCount: number };
}

function formatTimeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

const CriticalAlerts = ({ teamAlerts, isTeamView, userRole, realtimeAlerts, scanAlerts, connectionStatus }: CriticalAlertsProps) => {
  const navigate = useNavigate();

  // Priority: scanAlerts > realtimeAlerts > teamAlerts
  // AlertRecord has: id, vulnerability_id, user_id, status, created_at, updated_at
  const alerts = scanAlerts && scanAlerts.length > 0
    ? scanAlerts
    : realtimeAlerts
    ? realtimeAlerts.map((a) => ({
        id: a.id,
        title: `Vulnerability Alert`,
        project: a.vulnerability_id,
        timeAgo: formatTimeAgo(a.created_at),
      }))
    : isTeamView && teamAlerts
    ? teamAlerts
    : [];

  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      <div className="p-6 border-b border-border/50 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Critical Alerts
        </h3>
        <div className="flex items-center gap-2">
          {connectionStatus && (
            <ConnectionStatus
              status={connectionStatus.status}
              connectionCount={connectionStatus.connectionCount}
            />
          )}
          <span className="text-xs px-2 py-1 rounded-full bg-destructive/20 text-destructive font-medium">
            {alerts.length} Active
          </span>
        </div>
      </div>
      <div className="max-h-[280px] overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No critical issues found in completed scans.</div>
        ) : alerts.map((alert) => {
          const isTeamAlert = isTeamView && "memberName" in alert;
          const teamAlert = isTeamAlert ? (alert as TeamAlert) : null;

          return (
            <div
              key={alert.id}
              className="p-4 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer group"
            >
              <div className="flex items-start gap-3">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-destructive flex-shrink-0 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{alert.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">{alert.project}</span>
                    {teamAlert && (
                      <>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{teamAlert.memberName}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{teamAlert.branch}</span>
                      </>
                    )}
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{alert.timeAgo}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-4 border-t border-border/50">
        <button
          onClick={() => navigate("/alerts")}
          className="w-full text-center text-sm text-primary hover:text-primary/80 transition-colors font-medium"
        >
          View All Alerts
        </button>
      </div>
    </div>
  );
};

export default CriticalAlerts;
