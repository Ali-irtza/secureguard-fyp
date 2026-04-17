import { useState } from "react";
import { Bell, CheckCircle, AlertTriangle, Info, Filter } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Notification {
  id: string;
  title: string;
  description: string;
  type: "critical" | "warning" | "info" | "success";
  timeAgo: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  { id: "1", title: "Critical vulnerability found", description: "SQL Injection detected in auth-service", type: "critical", timeAgo: "2 minutes ago", read: false },
  { id: "2", title: "Scan completed", description: "frontend-app scan finished successfully", type: "success", timeAgo: "15 minutes ago", read: false },
  { id: "3", title: "New project added", description: "api-gateway was added to your workspace", type: "info", timeAgo: "1 hour ago", read: true },
  { id: "4", title: "Medium severity issue", description: "Outdated dependency in payment-service", type: "warning", timeAgo: "2 hours ago", read: true },
  { id: "5", title: "Weekly summary ready", description: "Your weekly security report is available", type: "info", timeAgo: "1 day ago", read: true },
  { id: "6", title: "XSS vulnerability patched", description: "Issue resolved in user-dashboard", type: "success", timeAgo: "2 days ago", read: true },
];

const Notifications = () => {
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const filteredNotifications = filter === "unread" 
    ? mockNotifications.filter(n => !n.read)
    : mockNotifications;

  const getTypeIcon = (type: Notification["type"]) => {
    switch (type) {
      case "critical": return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case "warning": return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "success": return <CheckCircle className="h-5 w-5 text-primary" />;
      case "info": return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getTypeBadge = (type: Notification["type"]) => {
    const variants: Record<Notification["type"], string> = {
      critical: "bg-destructive/20 text-destructive",
      warning: "bg-yellow-500/20 text-yellow-500",
      success: "bg-primary/20 text-primary",
      info: "bg-blue-500/20 text-blue-500",
    };
    return variants[type];
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
              <Bell className="h-8 w-8 text-primary" />
              Notifications
            </h1>
            <p className="text-muted-foreground mt-1">
              Stay updated on your security scans and alerts
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            <Button
              variant={filter === "unread" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("unread")}
            >
              Unread ({mockNotifications.filter(n => !n.read).length})
            </Button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="glass-card overflow-hidden">
          {filteredNotifications.length === 0 ? (
            <div className="p-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No notifications to show</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer ${
                  !notification.read ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">{getTypeIcon(notification.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-foreground">{notification.title}</p>
                      {!notification.read && (
                        <span className="h-2 w-2 bg-primary rounded-full" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{notification.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge className={getTypeBadge(notification.type)}>
                        {notification.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{notification.timeAgo}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Notifications;
