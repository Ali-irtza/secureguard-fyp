import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell } from "lucide-react";
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
import { mockTeams, CURRENT_USER_ID } from "@/lib/team-data";
import { supabase } from "@/lib/supabase";

interface DashboardTopBarProps {
  hasNotifications?: boolean;
}

const DashboardTopBar = ({ hasNotifications = true }: DashboardTopBarProps) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  // Determine primary role (highest privilege across all teams)
  const primaryRole = useMemo(() => {
    const userTeams = mockTeams.filter(t => t.members.some(m => m.id === CURRENT_USER_ID));
    if (userTeams.some(t => t.currentUserRole === "admin")) return "admin";
    if (userTeams.some(t => t.currentUserRole === "developer")) return "developer";
    if (userTeams.length > 0) return "viewer";
    return null;
  }, []);

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
        
        {/* Global Search */}
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
        {/* Notification Bell */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative p-2 rounded-xl hover:bg-muted/50 transition-colors">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {hasNotifications && (
                <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 bg-destructive rounded-full animate-pulse" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 glass-card border-border/50">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-destructive rounded-full" />
                <span className="font-medium">Critical vulnerability found</span>
              </div>
              <span className="text-xs text-muted-foreground">SQL Injection in auth-service • 2m ago</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-yellow-500 rounded-full" />
                <span className="font-medium">Scan completed</span>
              </div>
              <span className="text-xs text-muted-foreground">frontend-app scan finished • 15m ago</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-center text-primary justify-center cursor-pointer"
              onClick={() => navigate("/notifications")}
            >
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-muted/50 transition-colors">
              <Avatar className="h-8 w-8 border border-border/50">
                <AvatarImage src="" />
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-medium">JD</AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium text-foreground">John Doe</span>
                <span className="text-xs text-muted-foreground">Admin</span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 glass-card border-border/50">
            {/* Profile Header */}
            <div className="px-3 py-3 flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-semibold">JD</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">John Doe</p>
                <p className="text-xs text-muted-foreground truncate">john.doe@secureguard.io</p>
                {primaryRole && (
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 mt-1 ${getRoleBadgeClasses(primaryRole)}`}>
                    {primaryRole}
                  </Badge>
                )}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="cursor-pointer"
              onClick={() => navigate("/settings?tab=profile")}
            >
              Profile Settings
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="cursor-pointer"
              onClick={() => navigate("/settings?tab=api-keys")}
            >
              API Keys
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive cursor-pointer"
              onClick={handleLogout}
            >
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default DashboardTopBar;
