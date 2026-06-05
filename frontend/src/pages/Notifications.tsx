import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Bell, CheckCircle, AlertTriangle, Info } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getScanHistory } from "@/lib/scans-api";
import { listProjects } from "@/lib/projects-api";
import { getTeamDashboard, listTeams } from "@/lib/teams-api";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  buildNotifications,
  formatTimeAgo,
  getLocalNotifications,
  getNotificationPreferences,
  type AppNotification,
  type NotificationType,
} from "@/lib/notifications";

const Notifications = () => {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [preferences, setPreferences] = useState(getNotificationPreferences);
  const [localNotifications, setLocalNotifications] = useState<AppNotification[]>(getLocalNotifications);
  const { user } = useCurrentUser();

  const { data: scans = [] } = useQuery({ queryKey: ["scan-history"], queryFn: getScanHistory });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const { data: teams = [] } = useQuery({ queryKey: ["teams"], queryFn: listTeams });
  const teamDashboardQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["team-dashboard", team.id],
      queryFn: () => getTeamDashboard(team.id),
      enabled: preferences.teamMemberScanned,
      staleTime: 5 * 60_000,
    })),
  });

  useEffect(() => {
    const sync = () => {
      setPreferences(getNotificationPreferences());
      setLocalNotifications(getLocalNotifications());
    };
    window.addEventListener("secureguard:notification-preferences", sync);
    window.addEventListener("secureguard:notifications", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("secureguard:notification-preferences", sync);
      window.removeEventListener("secureguard:notifications", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const notifications = useMemo(
    () => buildNotifications({
      scans,
      projects,
      teams,
      preferences,
      localNotifications,
      currentUserId: user?.id,
      teamScans: teamDashboardQueries.flatMap((query) => query.data?.recentScans ?? []),
    }),
    [localNotifications, preferences, projects, scans, teamDashboardQueries, teams, user?.id]
  );

  const filteredNotifications = filter === "unread"
    ? notifications.filter((notification) => !notification.read)
    : notifications;

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case "critical": return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case "warning": return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "success": return <CheckCircle className="h-5 w-5 text-primary" />;
      case "info": return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getTypeBadge = (type: NotificationType) => {
    const variants: Record<NotificationType, string> = {
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
              <Bell className="h-8 w-8 text-primary" />
              Notifications
            </h1>
            <p className="text-muted-foreground mt-1">
              Stay updated on your security scans and alerts
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
              All
            </Button>
            <Button variant={filter === "unread" ? "default" : "outline"} size="sm" onClick={() => setFilter("unread")}>
              Unread ({notifications.filter((notification) => !notification.read).length})
            </Button>
          </div>
        </div>

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
                className={`p-4 border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors ${
                  !notification.read ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">{getTypeIcon(notification.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-foreground">{notification.title}</p>
                      {!notification.read && <span className="h-2 w-2 bg-primary rounded-full" />}
                    </div>
                    <p className="text-sm text-muted-foreground">{notification.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge className={getTypeBadge(notification.type)}>{notification.type}</Badge>
                      <span className="text-xs text-muted-foreground">{formatTimeAgo(notification.createdAt)}</span>
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
