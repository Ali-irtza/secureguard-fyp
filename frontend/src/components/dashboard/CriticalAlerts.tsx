import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";

interface Alert {
  id: string;
  title: string;
  project: string;
  timeAgo: string;
}

const mockAlerts: Alert[] = [
  { id: "1", title: "SQL Injection", project: "auth-service", timeAgo: "2 hours ago" },
  { id: "2", title: "XSS Vulnerability", project: "frontend-app", timeAgo: "4 hours ago" },
  { id: "3", title: "Hardcoded Secrets", project: "api-gateway", timeAgo: "6 hours ago" },
  { id: "4", title: "Path Traversal", project: "file-service", timeAgo: "1 day ago" },
  { id: "5", title: "CSRF Token Missing", project: "admin-panel", timeAgo: "2 days ago" },
];

const CriticalAlerts = () => {
  const navigate = useNavigate();
  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      <div className="p-6 border-b border-border/50 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Critical Alerts
        </h3>
        <span className="text-xs px-2 py-1 rounded-full bg-destructive/20 text-destructive font-medium">
          {mockAlerts.length} Active
        </span>
      </div>
      <div className="max-h-[280px] overflow-y-auto">
        {mockAlerts.map((alert) => (
          <div
            key={alert.id}
            className="p-4 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer group"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-destructive flex-shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{alert.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{alert.project}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{alert.timeAgo}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}
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
