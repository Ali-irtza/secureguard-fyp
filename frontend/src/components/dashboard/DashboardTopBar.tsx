import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell } from "lucide-react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getScanHistory } from "@/lib/scans-api";
import { listProjects } from "@/lib/projects-api";
import { getTeamDashboard, listTeams } from "@/lib/teams-api";
import {
  buildNotifications,
  formatTimeAgo,
  getLocalNotifications,
  getNotificationPreferences,
  type AppNotification,
} from "@/lib/notifications";

interface DashboardTopBarProps {
  hasNotifications?: boolean;
}

const notificationDotClass = (type: string) => {
  if (type === "critical") return "bg-destructive";
  if (type === "warning") return "bg-yellow-500";
  if (type === "success") return "bg-primary";
  return "bg-blue-500";
};

const DashboardTopBar = ({ hasNotifications = true }: DashboardTopBarProps) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [preferences, setPreferences] = useState(getNotificationPreferences);
  const [localNotifications, setLocalNotifications] = useState<AppNotification[]>(getLocalNotifications);
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());
  const initializedNotificationsRef = useRef(false);
  const { user, displayName, email, avatarUrl, initials } = useCurrentUser();

  const { data: scans = [] } = useQuery({ queryKey: ["scan-history"], queryFn: getScanHistory });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const { data: teams = [] } = useQuery({ queryKey: ["teams"], queryFn: listTeams });
  const teamDashboardQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["team-dashboard", team.id],
      queryFn: () => getTeamDashboard(team.id),
      enabled: preferences.teamMemberScanned,
      refetchInterval: preferences.teamMemberScanned ? 15_000 : false,
    })),
  });

  useEffect(() => {
    const syncNotifications = () => {
      setPreferences(getNotificationPreferences());
      setLocalNotifications(getLocalNotifications());
    };
    window.addEventListener("secureguard:notification-preferences", syncNotifications);
    window.addEventListener("secureguard:notifications", syncNotifications);
    window.addEventListener("storage", syncNotifications);
    return () => {
      window.removeEventListener("secureguard:notification-preferences", syncNotifications);
      window.removeEventListener("secureguard:notifications", syncNotifications);
      window.removeEventListener("storage", syncNotifications);
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

  const primaryRole = useMemo(() => {
    if (teams.some((team) => team.current_user_role === "admin")) return "admin";
    if (teams.some((team) => team.current_user_role === "developer")) return "developer";
    if (teams.length > 0) return "viewer";
    return null;
  }, [teams]);

  useEffect(() => {
    if (!initializedNotificationsRef.current) {
      knownNotificationIdsRef.current = new Set(notifications.map((notification) => notification.id));
      initializedNotificationsRef.current = true;
      return;
    }

    const newest = notifications.find((notification) => !knownNotificationIdsRef.current.has(notification.id));
    knownNotificationIdsRef.current = new Set(notifications.map((notification) => notification.id));
    if (!newest) return;
    if (!newest.id.startsWith("team-scan-")) return;

    const toastFn = newest.type === "critical" ? toast.error : newest.type === "success" ? toast.success : toast.info;
    toastFn(newest.title, { description: newest.description });
  }, [notifications]);

  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case "admin": return "bg-primary/15 text-primary border-primary/30";
      case "developer": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      case "viewer": return "bg-muted text-muted-foreground border-border/50";
      default: return "";
    }
  };

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      navigate(`/scan-history?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/auth");
  };

  return (
    <header className="h-16 border-b border-border/50 bg-card/30 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger />
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search scans, reports, vulnerabilities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearch}
            className="w-64 lg:w-96 pl-10 bg-muted/30 border-border/50 focus:border-primary/50 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative p-2 rounded-xl hover:bg-muted/50 transition-colors" aria-label="Notifications">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {hasNotifications && notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-destructive rounded-full animate-pulse" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 glass-card border-border/50">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <DropdownMenuItem className="py-3 text-sm text-muted-foreground">
                No notifications yet
              </DropdownMenuItem>
            ) : (
              notifications.slice(0, 5).map((notification) => (
                <DropdownMenuItem key={notification.id} className="flex flex-col items-start gap-1 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${notificationDotClass(notification.type)}`} />
                    <span className="font-medium">{notification.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {notification.description} - {formatTimeAgo(notification.createdAt)}
                  </span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-center text-primary justify-center cursor-pointer"
              onClick={() => navigate("/notifications")}
            >
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-muted/50 transition-colors">
              <Avatar className="h-8 w-8 border border-border/50">
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-medium">{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium text-foreground">{displayName}</span>
                <span className="text-xs text-muted-foreground">{email}</span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 glass-card border-border/50">
            <div className="px-3 py-3 flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{email}</p>
                {primaryRole && (
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 mt-1 ${getRoleBadgeClasses(primaryRole)}`}>
                    {primaryRole}
                  </Badge>
                )}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/settings?tab=profile")}>
              Profile Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive cursor-pointer" onClick={handleLogout}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default DashboardTopBar;
