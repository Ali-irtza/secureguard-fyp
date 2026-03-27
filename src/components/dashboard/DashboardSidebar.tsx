import { Shield, LayoutDashboard, Plus, FolderKanban, Users, FileBarChart, Settings, LogOut, HelpCircle, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const mainNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "New Scan", url: "/new-scan", icon: Plus, isPrimary: true },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Team", url: "/team", icon: Users },
  { title: "Scan History", url: "/scan-history", icon: FileBarChart },
  { title: "Reports", url: "/reports", icon: FileText },
];

const bottomNavItems = [
  { title: "Help", url: "/help", icon: HelpCircle },
  { title: "Settings", url: "/settings", icon: Settings },
];

const DashboardSidebar = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("dev_authenticated");
    localStorage.removeItem("dev_user_email");
    toast.success("You've been logged out");
    navigate("/auth");
  };
  return (
    <Sidebar className="border-r border-border/50 bg-card/50 backdrop-blur-xl">
      <SidebarHeader className="p-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Shield className="h-8 w-8 text-primary" />
            <div className="absolute inset-0 h-8 w-8 bg-primary/20 blur-lg rounded-full" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg text-foreground">SecureGuard</span>
            <span className="text-xs text-muted-foreground">Pro Edition</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item, index) => (
                <SidebarMenuItem key={item.title} className={`animate-slide-up stagger-${index + 1}`}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                        item.isPrimary
                          ? "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 glow-emerald"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:pl-5"
                      }`}
                      activeClassName="bg-primary/20 text-primary border-primary/50"
                    >
                      <item.icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                      <span className="font-medium">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-6">
        <SidebarSeparator className="mb-4" />
        <SidebarMenu>
          {bottomNavItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <NavLink
                  to={item.url}
                  className="group flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:pl-5 transition-all duration-200"
                  activeClassName="bg-muted text-foreground"
                >
                  <item.icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                  <span className="font-medium">{item.title}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <button
                onClick={handleLogout}
                className="group flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:pl-5 transition-all duration-200 w-full"
              >
                <LogOut className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                <span className="font-medium">Logout</span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default DashboardSidebar;
