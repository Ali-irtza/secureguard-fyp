import { useState } from "react";
import { AlertTriangle, Shield, Filter, ChevronRight } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Alert {
  id: string;
  title: string;
  description: string;
  project: string;
  severity: "critical" | "high" | "medium";
  timeAgo: string;
  status: "open" | "investigating" | "resolved";
}

const mockAlerts: Alert[] = [
  { id: "1", title: "SQL Injection", description: "User input not sanitized in login form", project: "auth-service", severity: "critical", timeAgo: "2 hours ago", status: "open" },
  { id: "2", title: "XSS Vulnerability", description: "Stored XSS in comment section", project: "frontend-app", severity: "critical", timeAgo: "4 hours ago", status: "investigating" },
  { id: "3", title: "Hardcoded Secrets", description: "API keys found in source code", project: "api-gateway", severity: "critical", timeAgo: "6 hours ago", status: "open" },
  { id: "4", title: "Path Traversal", description: "File access not properly restricted", project: "file-service", severity: "high", timeAgo: "1 day ago", status: "open" },
  { id: "5", title: "CSRF Token Missing", description: "Forms lack CSRF protection", project: "admin-panel", severity: "high", timeAgo: "2 days ago", status: "resolved" },
  { id: "6", title: "Insecure Dependencies", description: "Outdated packages with known CVEs", project: "payment-service", severity: "medium", timeAgo: "3 days ago", status: "investigating" },
];

const Alerts = () => {
  const [filter, setFilter] = useState<"all" | "critical" | "high" | "medium">("all");

  const filteredAlerts = filter === "all" 
    ? mockAlerts 
    : mockAlerts.filter(a => a.severity === filter);

  const getSeverityBadge = (severity: Alert["severity"]) => {
    const variants: Record<Alert["severity"], string> = {
      critical: "bg-destructive/20 text-destructive border-destructive/30",
      high: "bg-orange-500/20 text-orange-500 border-orange-500/30",
      medium: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
    };
    return variants[severity];
  };

  const getStatusBadge = (status: Alert["status"]) => {
    const variants: Record<Alert["status"], string> = {
      open: "bg-destructive/20 text-destructive",
      investigating: "bg-blue-500/20 text-blue-500",
      resolved: "bg-primary/20 text-primary",
    };
    return variants[status];
  };

  const criticalCount = mockAlerts.filter(a => a.severity === "critical").length;
  const highCount = mockAlerts.filter(a => a.severity === "high").length;
  const mediumCount = mockAlerts.filter(a => a.severity === "medium").length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              Security Alerts
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor and manage critical security issues
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All ({mockAlerts.length})
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

        {/* Alerts List */}
        <div className="glass-card overflow-hidden">
          {filteredAlerts.length === 0 ? (
            <div className="p-12 text-center">
              <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">No alerts matching the filter</p>
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
                      <Badge className={getStatusBadge(alert.status)}>
                        {alert.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{alert.timeAgo}</span>
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
