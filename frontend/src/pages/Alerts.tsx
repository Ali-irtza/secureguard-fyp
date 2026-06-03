import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Shield, ChevronRight } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getScanHistory } from "@/lib/scans-api";

type AlertSeverity = "critical" | "high" | "medium";
type AlertFilter = "all" | AlertSeverity;

interface Alert {
  id: string;
  title: string;
  description: string;
  project: string;
  severity: AlertSeverity;
  time: string;
  createdAt: string;
  filePath?: string | null;
}

const severityOrder: Record<AlertSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

const normalizeSeverity = (severity: string | null | undefined): AlertSeverity | null => {
  const normalized = String(severity ?? "").toLowerCase();
  return normalized === "critical" || normalized === "high" || normalized === "medium"
    ? normalized
    : null;
};

const formatAlertTime = (isoString: string): string => {
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

const Alerts = () => {
  const [filter, setFilter] = useState<AlertFilter>("all");

  const { data: scans = [], isLoading, isError } = useQuery({
    queryKey: ["scan-history"],
    queryFn: getScanHistory,
  });

  const alerts = useMemo<Alert[]>(() => {
    return scans
      .flatMap((scan) =>
        (scan.alert_findings ?? []).flatMap((finding) => {
          const severity = normalizeSeverity(finding.severity);
          if (!severity) return [];

          const createdAt = finding.created_at || scan.created_at;
          return {
            id: finding.id,
            title: `${finding.cwe_id || finding.type || "Security Issue"}${finding.line_number ? ` at line ${finding.line_number}` : ""}`,
            description: finding.description || finding.cwe_name || "No description available.",
            project: scan.project_name || scan.file_name || finding.file_path || "Project",
            severity,
            time: formatAlertTime(createdAt),
            createdAt,
            filePath: finding.file_path,
          };
        })
      )
      .sort((a, b) => {
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [scans]);

  const filteredAlerts = filter === "all"
    ? alerts
    : alerts.filter((alert) => alert.severity === filter);

  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  const highCount = alerts.filter((alert) => alert.severity === "high").length;
  const mediumCount = alerts.filter((alert) => alert.severity === "medium").length;

  const getSeverityBadge = (severity: AlertSeverity) => {
    const variants: Record<AlertSeverity, string> = {
      critical: "bg-destructive/20 text-destructive border-destructive/30",
      high: "bg-orange-500/20 text-orange-500 border-orange-500/30",
      medium: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
    };
    return variants[severity];
  };

  const emptyMessage = isLoading
    ? "Loading alerts..."
    : isError
    ? "Failed to load alerts."
    : "No alerts matching the filter";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              Security Alerts
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor and manage personal scan security issues
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All ({alerts.length})
            </Button>
            <Button
              variant={filter === "critical" ? "destructive" : "outline"}
              size="sm"
              onClick={() => setFilter("critical")}
            >
              Critical ({criticalCount})
            </Button>
            <Button
              variant={filter === "high" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("high")}
              className={filter === "high" ? "bg-orange-500 hover:bg-orange-600" : ""}
            >
              High ({highCount})
            </Button>
            <Button
              variant={filter === "medium" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("medium")}
              className={filter === "medium" ? "bg-yellow-500 hover:bg-yellow-600 text-black" : ""}
            >
              Medium ({mediumCount})
            </Button>
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          {filteredAlerts.length === 0 ? (
            <div className="p-12 text-center">
              <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
              <p className={isError ? "text-destructive" : "text-muted-foreground"}>{emptyMessage}</p>
            </div>
          ) : (
            filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className="p-4 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer group"
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    <AlertTriangle className={`h-5 w-5 ${
                      alert.severity === "critical" ? "text-destructive" :
                      alert.severity === "high" ? "text-orange-500" : "text-yellow-500"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-foreground">{alert.title}</p>
                      <Badge variant="outline" className={getSeverityBadge(alert.severity)}>
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{alert.description}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                        {alert.project}
                      </span>
                      {alert.filePath && (
                        <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                          {alert.filePath}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{alert.time}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Alerts;
