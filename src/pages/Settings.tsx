import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { User, Key, Bell, Copy, Eye, EyeOff, RefreshCw, Camera, Palette, Sun, Moon, Monitor, Users, Crown, Trash2, Github, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { mockTeams, CURRENT_USER_ID } from "@/lib/team-data";

const Settings = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("profile");

  // Team data
  const userTeams = useMemo(() => mockTeams.filter(t => t.members.some(m => m.id === CURRENT_USER_ID)), []);
  const hasTeams = userTeams.length > 0;

  useEffect(() => {
    const tab = searchParams.get("tab");
    const validTabs = ["profile", "api-keys", "notifications", "team-permissions", "appearance"];
    if (tab && validTabs.includes(tab)) {
      if (tab === "team-permissions" && !hasTeams) return;
      setActiveTab(tab);
    }
  }, [searchParams, hasTeams]);
  
  // Profile state
  const [name, setName] = useState("Alex Johnson");
  const [email] = useState("alex.johnson@secureguard.io");

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // API Key state
  const [apiKey] = useState("sg_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456");
  const [showKey, setShowKey] = useState(false);

  // Notification state
  const [notifications, setNotifications] = useState({
    criticalAlerts: true,
    scanCompleted: false,
    newProject: false,
    teamMemberScanned: false,
  });

  // Team & Permissions state
  const [selectedTeamId, setSelectedTeamId] = useState(userTeams[0]?.id || "");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"developer" | "viewer">("developer");
  const [connectGithubOpen, setConnectGithubOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoPat, setRepoPat] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [tempTeamName, setTempTeamName] = useState("");

  const selectedTeam = useMemo(() => userTeams.find(t => t.id === selectedTeamId), [userTeams, selectedTeamId]);
  const currentUserRole = selectedTeam?.currentUserRole || "viewer";
  const isAdmin = currentUserRole === "admin";

  const handleSaveProfile = () => {
    toast.success("Profile updated successfully");
  };

  const handleUpdatePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    toast.success("Password updated successfully");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    toast.success("API key copied to clipboard");
  };

  const handleRegenerateKey = () => {
    toast.success("New API key generated successfully");
  };

  const handleInviteMember = () => {
    if (!inviteEmail) return;
    toast.success(`Invite sent to ${inviteEmail}`);
    setInviteEmail("");
    setInviteRole("developer");
    setInviteModalOpen(false);
  };

  const handleConnectGithub = () => {
    if (!repoUrl) return;
    toast.success("GitHub repository connected successfully");
    setRepoUrl("");
    setRepoPat("");
    setConnectGithubOpen(false);
  };

  const maskedKey = `${"•".repeat(32)}${apiKey.slice(-8)}`;

  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case "admin": return "bg-primary/15 text-primary border-primary/30";
      case "developer": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      case "viewer": return "bg-muted text-muted-foreground border-border/50";
      default: return "bg-muted text-muted-foreground border-border/50";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account preferences and security settings
          </p>
        </div>

        {/* Vertical Tabs Layout */}
        <Tabs value={activeTab} onValueChange={setActiveTab} orientation="vertical" className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Navigation */}
          <TabsList className="flex lg:flex-col h-auto bg-card/50 backdrop-blur-sm border border-border/50 p-2 rounded-lg lg:w-56 shrink-0">
            <TabsTrigger
              value="profile"
              className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger
              value="api-keys"
              className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            {hasTeams && (
              <TabsTrigger
                value="team-permissions"
                className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
              >
                <Users className="h-4 w-4" />
                Team & Permissions
              </TabsTrigger>
            )}
            <TabsTrigger
              value="appearance"
              className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              <Palette className="h-4 w-4" />
              Appearance
            </TabsTrigger>
          </TabsList>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
            {/* Profile Tab */}
            <TabsContent value="profile" className="mt-0">
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Update your personal details and avatar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar Section */}
                  <div className="flex items-center gap-6">
                    <div className="relative group">
                      <Avatar className="h-20 w-20 border-2 border-primary/20">
                        <AvatarImage src="" />
                        <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                          {name.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <button className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="h-6 w-6 text-foreground" />
                      </button>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Profile Photo</p>
                      <p className="text-sm text-muted-foreground">Click to upload a new avatar</p>
                    </div>
                  </div>

                  {/* Name Input */}
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-background/50 border-border/50"
                    />
                  </div>

                  {/* Email Input */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      readOnly
                      className="bg-background/50 border-border/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your email address cannot be changed here for security reasons.
                    </p>
                  </div>

                  <Button onClick={handleSaveProfile} className="bg-primary hover:bg-primary/90">
                    Save Changes
                  </Button>

                  <Separator className="my-2" />

                  {/* Change Password Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-foreground">Change Password</h3>
                    
                    <div className="space-y-2">
                      <Label htmlFor="current-password">Current Password</Label>
                      <div className="relative">
                        <Input
                          id="current-password"
                          type={showCurrentPassword ? "text" : "password"}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter current password"
                          className="bg-background/50 border-border/50 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="new-password">New Password</Label>
                      <div className="relative">
                        <Input
                          id="new-password"
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          className="bg-background/50 border-border/50 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm New Password</Label>
                      <div className="relative">
                        <Input
                          id="confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          className="bg-background/50 border-border/50 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <Button onClick={handleUpdatePassword} className="bg-primary hover:bg-primary/90">
                      Update Password
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* API Keys Tab */}
            <TabsContent value="api-keys" className="mt-0">
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <CardTitle>Personal Access Token</CardTitle>
                  <CardDescription>
                    Use this token to authenticate API requests from external tools and scripts
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Token Display */}
                  <div className="space-y-3">
                    <Label>Your API Key</Label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Input
                          value={showKey ? apiKey : maskedKey}
                          readOnly
                          className="bg-background/50 border-border/50 font-mono text-sm pr-10"
                        />
                        <button
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button variant="outline" size="icon" onClick={handleCopyKey}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Security Warning */}
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-destructive">
                      <strong>Keep your API key secure.</strong> Do not share it publicly or commit it to version control.
                      If you believe your key has been compromised, regenerate it immediately.
                    </p>
                  </div>

                  {/* Regenerate Button */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Regenerate Token
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Regenerate API Token?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will invalidate your current token immediately. Any applications using the old token will stop working.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRegenerateKey} className="bg-destructive hover:bg-destructive/90">
                          Regenerate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="mt-0">
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                  <CardDescription>Choose what alerts and updates you want to receive</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Critical Alerts */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="space-y-1">
                      <Label htmlFor="critical-alerts" className="font-medium">Critical Bug Alerts</Label>
                      <p className="text-sm text-muted-foreground">
                        Get notified immediately when critical vulnerabilities are found
                      </p>
                    </div>
                    <Switch
                      id="critical-alerts"
                      checked={notifications.criticalAlerts}
                      onCheckedChange={(checked) =>
                        setNotifications({ ...notifications, criticalAlerts: checked })
                      }
                    />
                  </div>

                  {/* Scan Completed */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="space-y-1">
                      <Label htmlFor="scan-completed" className="font-medium">Scan Completed</Label>
                      <p className="text-sm text-muted-foreground">
                        Notify when a security scan finishes
                      </p>
                    </div>
                    <Switch
                      id="scan-completed"
                      checked={notifications.scanCompleted}
                      onCheckedChange={(checked) =>
                        setNotifications({ ...notifications, scanCompleted: checked })
                      }
                    />
                  </div>

                  {/* New Project */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="space-y-1">
                      <Label htmlFor="new-project" className="font-medium">New Project Added</Label>
                      <p className="text-sm text-muted-foreground">
                        Notify when a team member adds a new project
                      </p>
                    </div>
                    <Switch
                      id="new-project"
                      checked={notifications.newProject}
                      onCheckedChange={(checked) =>
                        setNotifications({ ...notifications, newProject: checked })
                      }
                    />
                  </div>

                  {/* Team Member Scanned — only if user has teams */}
                  {hasTeams && (
                    <div className="flex items-center justify-between p-4 rounded-lg bg-background/30 border border-border/30">
                      <div className="space-y-1">
                        <Label htmlFor="team-member-scanned" className="font-medium">Team Member Scanned</Label>
                        <p className="text-sm text-muted-foreground">
                          Get notified when a team member completes a scan
                        </p>
                      </div>
                      <Switch
                        id="team-member-scanned"
                        checked={notifications.teamMemberScanned}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, teamMemberScanned: checked })
                        }
                      />
                    </div>
                  )}

                  <Button onClick={() => toast.success("Notification preferences saved")} className="bg-primary hover:bg-primary/90">
                    Save Preferences
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Team & Permissions Tab */}
            {hasTeams && (
              <TabsContent value="team-permissions" className="mt-0 space-y-6">
                {/* Team Selector */}
                {userTeams.length > 1 && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">Viewing settings for:</span>
                    <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                      <SelectTrigger className="w-64 bg-card/50 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {userTeams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            <div className="flex items-center gap-2">
                              <Crown className="h-3 w-3 text-primary" />
                              <span>{team.name}</span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getRoleBadgeClasses(team.currentUserRole)}`}>
                                {team.currentUserRole}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Non-admin info banner */}
                {!isAdmin && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border/30">
                    <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-sm text-muted-foreground">Only the team Admin can manage members and settings.</p>
                  </div>
                )}

                {/* Section 1 — Team Info */}
                <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        {editingTeamName && isAdmin ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={tempTeamName}
                              onChange={(e) => setTempTeamName(e.target.value)}
                              className="bg-background/50 border-border/50 h-8 w-64"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  toast.success("Team name updated");
                                  setEditingTeamName(false);
                                }
                                if (e.key === "Escape") setEditingTeamName(false);
                              }}
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" onClick={() => setEditingTeamName(false)}>Cancel</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xl">{selectedTeam?.name}</CardTitle>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setTempTeamName(selectedTeam?.name || "");
                                  setEditingTeamName(true);
                                }}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                        <CardDescription className="mt-1">Created on January 15, 2024</CardDescription>
                      </div>
                      {isAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" className="gap-2">
                              <Trash2 className="h-4 w-4" />
                              Delete Team
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure you want to delete this team?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => toast.success("Team deleted")}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Confirm
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </CardHeader>
                </Card>

                {/* Section 2 — Members */}
                <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle>Members</CardTitle>
                        <Badge variant="outline" className="bg-muted/50 border-border/50">
                          {selectedTeam?.members.length || 0}
                        </Badge>
                      </div>
                      {isAdmin && (
                        <Button onClick={() => setInviteModalOpen(true)} className="bg-primary hover:bg-primary/90 gap-2" size="sm">
                          <Users className="h-4 w-4" />
                          Invite Member
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/50">
                          <TableHead>Member</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Assigned Branch</TableHead>
                          {isAdmin && <TableHead className="w-16">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedTeam?.members.map((member) => {
                          const isSelf = member.id === CURRENT_USER_ID;
                          const memberRole = isSelf ? currentUserRole : (member.healthScore === null ? "viewer" : member.healthScore > 80 ? "admin" : "developer");
                          // For mock purposes, derive role from team data
                          const mockRole = selectedTeam.members.indexOf(member) === 0 ? 
                            (selectedTeam.currentUserRole === "admin" && isSelf ? "admin" : "developer") : 
                            (member.healthScore === null ? "viewer" : "developer");
                          const displayRole = isSelf ? currentUserRole : mockRole;

                          return (
                            <TableRow key={member.id} className="border-border/30">
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-8 w-8">
                                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                      {member.initials}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-foreground">{member.name}</span>
                                      {isSelf && !isAdmin && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30">You</Badge>
                                      )}
                                    </div>
                                    <span className="text-xs text-muted-foreground">{member.name.toLowerCase().replace(" ", ".")}@email.com</span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {isAdmin && !isSelf ? (
                                  <Select defaultValue={displayRole}>
                                    <SelectTrigger className="w-32 h-8 bg-background/50 border-border/50 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="admin">Admin</SelectItem>
                                      <SelectItem value="developer">Developer</SelectItem>
                                      <SelectItem value="viewer">Viewer</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Badge variant="outline" className={`text-xs ${getRoleBadgeClasses(displayRole)}`}>
                                    {displayRole}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {displayRole === "admin" ? (
                                  <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">All Branches</Badge>
                                ) : displayRole === "viewer" ? (
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Lock className="h-3 w-3" />
                                    <span className="text-xs">No branch</span>
                                  </div>
                                ) : isAdmin && !isSelf ? (
                                  <Select defaultValue={member.branch}>
                                    <SelectTrigger className="w-40 h-8 bg-background/50 border-border/50 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {selectedTeam.branches?.map((branch) => (
                                        <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-sm text-foreground">{member.branch}</span>
                                )}
                              </TableCell>
                              {isAdmin && (
                                <TableCell>
                                  {!isSelf && (
                                    <button
                                      onClick={() => toast.success(`${member.name} removed from team`)}
                                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Section 3 — GitHub Repository */}
                <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle>GitHub Repository</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedTeam?.githubRepo ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Github className="h-5 w-5 text-foreground" />
                          <a href={selectedTeam.githubRepo} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm">
                            {selectedTeam.githubRepo.replace("https://github.com/", "")}
                          </a>
                          <Badge className="bg-primary/15 text-primary border-primary/30 text-xs">Connected</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>Connected on January 15, 2024</p>
                          <p>{selectedTeam.branches?.length || 0} branches detected</p>
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" className="gap-2" onClick={() => toast.success("Branches refreshed")}>
                              <RefreshCw className="h-4 w-4" />
                              Refresh Branches
                            </Button>
                            <Button variant="destructive" size="sm" className="gap-2" onClick={() => toast.success("Repository disconnected")}>
                              Disconnect
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-border/50 rounded-lg p-8 flex flex-col items-center gap-3 text-center">
                        <Github className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">No repository connected</p>
                        {isAdmin && (
                          <Button onClick={() => setConnectGithubOpen(true)} className="bg-primary hover:bg-primary/90 gap-2" size="sm">
                            Connect Repository
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Invite Member Modal */}
                <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
                  <DialogContent className="bg-card border-border/50">
                    <DialogHeader>
                      <DialogTitle>Invite Member</DialogTitle>
                      <DialogDescription>Send an invitation to join {selectedTeam?.name}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Email Address</Label>
                        <Input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="teammate@email.com"
                          className="bg-background/50 border-border/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={inviteRole} onValueChange={(v: "developer" | "viewer") => setInviteRole(v)}>
                          <SelectTrigger className="bg-background/50 border-border/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="developer">Developer</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-xs text-muted-foreground">An invite link will be sent to their email</p>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setInviteModalOpen(false)}>Cancel</Button>
                      <Button onClick={handleInviteMember} className="bg-primary hover:bg-primary/90" disabled={!inviteEmail}>
                        Send Invite
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Connect GitHub Modal */}
                <Dialog open={connectGithubOpen} onOpenChange={setConnectGithubOpen}>
                  <DialogContent className="bg-card border-border/50">
                    <DialogHeader>
                      <DialogTitle>Connect GitHub Repository</DialogTitle>
                      <DialogDescription>Link a repository to enable GitHub-based scanning</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Repository URL</Label>
                        <Input
                          value={repoUrl}
                          onChange={(e) => setRepoUrl(e.target.value)}
                          placeholder="https://github.com/org/repo"
                          className="bg-background/50 border-border/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Personal Access Token</Label>
                        <div className="relative">
                          <Input
                            type={showPat ? "text" : "password"}
                            value={repoPat}
                            onChange={(e) => setRepoPat(e.target.value)}
                            placeholder="ghp_xxxxxxxxxxxx"
                            className="bg-background/50 border-border/50 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPat(!showPat)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showPat ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
                        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                          We only read your code for scanning. We never modify your repository.
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setConnectGithubOpen(false)}>Cancel</Button>
                      <Button onClick={handleConnectGithub} className="bg-primary hover:bg-primary/90" disabled={!repoUrl}>
                        Connect
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TabsContent>
            )}

            {/* Appearance Tab */}
            <TabsContent value="appearance" className="mt-0">
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <CardTitle>Appearance Settings</CardTitle>
                  <CardDescription>Customize the look and feel of your dashboard</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Theme Selector */}
                  <div className="space-y-3">
                    <Label>Theme</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: "light", label: "Light", icon: Sun },
                        { value: "dark", label: "Dark", icon: Moon },
                        { value: "system", label: "System", icon: Monitor },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setTheme(option.value)}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                            theme === option.value
                              ? "border-primary bg-primary/10"
                              : "border-border/50 hover:border-border"
                          }`}
                        >
                          <option.icon className={`h-6 w-6 ${theme === option.value ? "text-primary" : "text-muted-foreground"}`} />
                          <span className={`text-sm font-medium ${theme === option.value ? "text-primary" : "text-muted-foreground"}`}>
                            {option.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button onClick={() => toast.success("Appearance settings saved")} className="bg-primary hover:bg-primary/90">
                    Save Preferences
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
