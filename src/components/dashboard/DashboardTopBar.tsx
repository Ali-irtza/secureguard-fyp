import { Search, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardTopBarProps {
  hasNotifications?: boolean;
}

const DashboardTopBar = ({ hasNotifications = true }: DashboardTopBarProps) => {
  return (
    <header className="h-16 border-b border-border/50 bg-card/30 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="lg:hidden" />
        
        {/* Global Search */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search scans, reports, vulnerabilities..."
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
            <DropdownMenuItem className="text-center text-primary justify-center">
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
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile Settings</DropdownMenuItem>
            <DropdownMenuItem>Billing</DropdownMenuItem>
            <DropdownMenuItem>API Keys</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default DashboardTopBar;
