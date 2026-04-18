import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  User, Key, Bell, Copy, Eye, EyeOff, RefreshCw, Camera,
  Palette, Sun, Moon, Monitor, Users, Crown, Trash2, Github, ArrowRight,
} from "lucide-react";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { mockTeams, CURRENT_USER_ID } from "@/lib/team-data";
import { useCurrentUser, type UpdateProfilePayload } from "@/hooks/use-current-user";

const Settings = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("profile");

  // ---------------------------------------------------------------------------
  // Real user data — single source of truth via our hook (DRY)
  // ---------------------------------------------------------------------------
  const {
    profile, displayName, email, avatarUrl, initials,
    isOAuthUser, hasEmailIdentity, updateProfile, updatePassword,
  } = useCurrentUser();

  // ---------------------------------------------------------------------------
  // Profile tab state
  // ---------------------------------------------------------------------------
  const [name, setName] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // ---------------------------------------------------------------------------
  // Avatar upload state — declared before the profile sync effect that uses it
  // ---------------------------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);

  // Sync form fields from the profiles table row.
  // We depend on `profile` directly — not on `displayName` — because displayName
  // can temporarily resolve to user_metadata while the DB fetch is in flight,
  // which would pre-fill the form with Google's stale data.
  // avatarPreview is only updated from profile when no local file is pending,
  // so a user's freshly picked image is never overwritten by a re-render.
  useEffect(() => {
    if (profile) {
      // Use profile.full_name if set, otherwise fall back to displayName
      // (which is the email prefix) so the field is never blank on load
      setName(profile.full_name || displayName);
      if (profile.avatar_url && !pendingAvatarFile) {
        setAvatarPreview(profile.avatar_url);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // NOTE: avatarPreview is synced from profile inside the effect above.
  // We do NOT sync from avatarUrl (user_metadata) to avoid showing Google's
  // stale picture when the user has already set a custom one in our DB.

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate: images only, max 2MB
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be smaller than 2MB");
      return;
    }

    // Show a local preview immediately — no upload yet
    const localUrl = URL.createObjectURL(file);
    setAvatarPreview(localUrl);
    setPendingAvatarFile(file);
  };

  // ---------------------------------------------------------------------------
  // Password state (only shown for email/password users, not OAuth)
  // ---------------------------------------------------------------------------
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // ---------------------------------------------------------------------------
  // Team data (still from mock until teams feature is built)
  // ---------------------------------------------------------------------------
  const userTeams = useMemo(
    () => mockTeams.filter(t => t.members.some(m => m.id === CURRENT_USER_ID)),
    []
  );
  const hasTeams = userTeams.length > 0;

  // Sync active tab from URL query param (?tab=profile)
  useEffect(() => {
    const tab = searchParams.get("tab");
    const validTabs = ["profile", "api-keys", "notifications", "team-permissions", "appearance"];
    if (tab && validTabs.includes(tab)) {
      if (tab === "team-permissions" && !hasTeams) return;
      setActiveTab(tab);
    }
  }, [searchParams, hasTeams]);

  // ---------------------------------------------------------------------------
  // API Key state (placeholder until backend API key feature is built)
  // ---------------------------------------------------------------------------
  const [apiKey] = useState("sg_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456");
  const [showKey, setShowKey] = useState(false);
  const maskedKey = `${"•".repeat(32)}${apiKey.slice(-8)}`;

  // ---------------------------------------------------------------------------
  // Notification state (local for now — will be persisted to DB later)
  // ---------------------------------------------------------------------------
  const [notifications, setNotifications] = useState({
    criticalAlerts: true,
    scanCompleted: false,
    newProject: false,
    teamMemberScanned: false,
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }

    // Change detection — only call the API if something actually changed
    const nameChanged = name.trim() !== (profile?.full_name || "");
    const avatarChanged = !!pendingAvatarFile;

    if (!nameChanged && !avatarChanged) {
      toast.info("No changes to save");
      return;
    }

    setIsSavingProfile(true);

    const payload: UpdateProfilePayload = {};

    if (nameChanged) {
      payload.full_name = name.trim();
    }

    if (avatarChanged && pendingAvatarFile) {
      try {
        payload.avatar_url = await fileToBase64(pendingAvatarFile);
      } catch {
        toast.error("Failed to process image");
        setIsSavingProfile(false);
        return;
      }
    }

    const { error } = await updateProfile(payload);
    if (error) {
      toast.error(`Failed to update profile: ${error}`);
    } else {
      toast.success("Profile updated successfully");
      setPendingAvatarFile(null);
      // Update preview to the saved base64 so it stays correct
      if (payload.avatar_url) setAvatarPreview(payload.avatar_url);
    }
    setIsSavingProfile(false);
  };

  // Converts a File object to a base64 data URL string
  // e.g. "data:image/jpeg;base64,/9j/4AAQ..."
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error("Please fill in both password fields");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsSavingPassword(true);
    const { error } = await updatePassword(newPassword);
    if (error) {
      toast.error(`Failed to update password: ${error}`);
    } else {
      toast.success("Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
    }
    setIsSavingPassword(false);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    toast.success("API key copied to clipboard");
  };

  const handleRegenerateKey = () => {
    toast.success("New API key generated successfully");
  };

  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case "admin":     return "bg-primary/15 text-primary border-primary/30";
      case "developer": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      default:          return "bg-muted text-muted-foreground border-border/50";
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account preferences and security settings
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} orientation="vertical" className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Navigation */}
          <TabsList className="flex lg:flex-col h-auto bg-card/50 backdrop-blur-sm border border-border/50 p-2 rounded-lg lg:w-56 shrink-0">
            <TabsTrigger value="profile" className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <User className="h-4 w-4" /> Profile
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Key className="h-4 w-4" /> API Keys
            </TabsTrigger>
            <TabsTrigger value="notifications" className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Bell className="h-4 w-4" /> Notifications
            </TabsTrigger>
            {hasTeams && (
              <TabsTrigger value="team-permissions" className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <Users className="h-4 w-4" /> Team & Permissions
              </TabsTrigger>
            )}
            <TabsTrigger value="appearance" className="w-full justify-start gap-3 px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Palette className="h-4 w-4" /> Appearance
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-w-0">

            {/* ----------------------------------------------------------------
                PROFILE TAB — fully wired to live Supabase data
            ---------------------------------------------------------------- */}
            <TabsContent value="profile" className="mt-0">
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Update your personal details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                  {/* Avatar */}
                  <div className="flex items-center gap-6">
                    <div className="relative group">
                      <Avatar className="h-20 w-20 border-2 border-primary/20">
                        <AvatarImage src={avatarPreview || avatarUrl} referrerPolicy="no-referrer" />
                        <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      {/* Hidden file input — triggered by the camera button */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarFileChange}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Upload profile photo"
                      >
                        <Camera className="h-6 w-6 text-foreground" />
                      </button>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Profile Photo</p>
                      <p className="text-sm text-muted-foreground">
                        Click the photo to upload a new image (max 2MB)
                      </p>
                      {pendingAvatarFile && (
                        <p className="text-xs text-primary mt-1">
                          New photo selected — click Save Changes to apply
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Full Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-background/50 border-border/50"
                      placeholder="Your full name"
                    />
                  </div>

                  {/* Email — read-only, always */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      readOnly
                      className="bg-background/50 border-border/50 opacity-70 cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground">
                      Email cannot be changed here for security reasons.
                    </p>
                  </div>

                  <Button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {isSavingProfile ? "Saving..." : "Save Changes"}
                  </Button>

                  <Separator />

                  {/* ----------------------------------------------------------------
                      Change Password — shown only when user has an email identity.
                      hasEmailIdentity checks user.identities array — the only
                      reliable source. Works correctly for linked accounts too.
                  ---------------------------------------------------------------- */}
                  {!hasEmailIdentity ? (
                    <div className="p-4 rounded-lg bg-muted/30 border border-border/30">
                      <p className="text-sm text-muted-foreground">
                        You signed in with Google or GitHub. Password management is handled by your provider.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-foreground">Change Password</h3>

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

                      <Button
                        onClick={handleUpdatePassword}
                        disabled={isSavingPassword}
                        className="bg-primary hover:bg-primary/90"
                      >
                        {isSavingPassword ? "Updating..." : "Update Password"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ----------------------------------------------------------------
                API KEYS TAB
            ---------------------------------------------------------------- */}
            <TabsContent value="api-keys" className="mt-0">
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <CardTitle>Personal Access Token</CardTitle>
                  <CardDescription>
                    Use this token to authenticate API requests from external tools and scripts
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
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

                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-destructive">
                      <strong>Keep your API key secure.</strong> Do not share it publicly or commit it to version control.
                      If compromised, regenerate it immediately.
                    </p>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="gap-2">
                        <RefreshCw className="h-4 w-4" /> Regenerate Token
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

            {/* ----------------------------------------------------------------
                NOTIFICATIONS TAB
            ---------------------------------------------------------------- */}
            <TabsContent value="notifications" className="mt-0">
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                  <CardDescription>Choose what alerts and updates you want to receive</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {[
                    { key: "criticalAlerts", label: "Critical Bug Alerts", desc: "Get notified immediately when critical vulnerabilities are found" },
                    { key: "scanCompleted", label: "Scan Completed", desc: "Notify when a security scan finishes" },
                    { key: "newProject", label: "New Project Added", desc: "Notify when a team member adds a new project" },
                    ...(hasTeams ? [{ key: "teamMemberScanned", label: "Team Member Scanned", desc: "Get notified when a team member completes a scan" }] : []),
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between p-4 rounded-lg bg-background/30 border border-border/30">
                      <div className="space-y-1">
                        <Label htmlFor={key} className="font-medium">{label}</Label>
                        <p className="text-sm text-muted-foreground">{desc}</p>
                      </div>
                      <Switch
                        id={key}
                        checked={notifications[key as keyof typeof notifications]}
                        onCheckedChange={(checked) =>
                          setNotifications(prev => ({ ...prev, [key]: checked }))
                        }
                      />
                    </div>
                  ))}

                  <Button onClick={() => toast.success("Notification preferences saved")} className="bg-primary hover:bg-primary/90">
                    Save Preferences
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ----------------------------------------------------------------
                TEAM & PERMISSIONS TAB
            ---------------------------------------------------------------- */}
            {hasTeams && (
              <TabsContent value="team-permissions" className="mt-0 space-y-6">
                <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle>Your Teams</CardTitle>
                    <CardDescription>Manage your team memberships and settings</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {userTeams.map((team) => {
                      const isTeamAdmin = team.currentUserRole === "admin";
                      const repoName = team.githubRepo?.replace("https://github.com/", "") ?? null;

                      return (
                        <div key={team.id} className="flex items-center justify-between p-4 rounded-lg bg-background/30 border border-border/30">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              {isTeamAdmin
                                ? <Crown className="h-5 w-5 text-primary" />
                                : <Users className="h-5 w-5 text-muted-foreground" />}
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{team.name}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getRoleBadgeClasses(team.currentUserRole)}`}>
                                  {team.currentUserRole}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>{team.members.length} members</span>
                                {repoName && (
                                  <span className="flex items-center gap-1">
                                    <Github className="h-3 w-3" /> {repoName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={() => navigate("/team")}>
                              Manage Team <ArrowRight className="h-4 w-4" />
                            </Button>
                            {isTeamAdmin && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm" className="gap-2">
                                    <Trash2 className="h-4 w-4" /> Delete Team
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete {team.name}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      All members will be removed. This cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => toast.success(`${team.name} deleted`)} className="bg-destructive hover:bg-destructive/90">
                                      Delete Team
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* ----------------------------------------------------------------
                APPEARANCE TAB
            ---------------------------------------------------------------- */}
            <TabsContent value="appearance" className="mt-0">
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader>
                  <CardTitle>Appearance Settings</CardTitle>
                  <CardDescription>Customize the look and feel of your dashboard</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label>Theme</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: "light", label: "Light", icon: Sun },
                        { value: "dark",  label: "Dark",  icon: Moon },
                        { value: "system", label: "System", icon: Monitor },
                      ].map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          onClick={() => setTheme(value)}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                            theme === value
                              ? "border-primary bg-primary/10"
                              : "border-border/50 hover:border-border"
                          }`}
                        >
                          <Icon className={`h-6 w-6 ${theme === value ? "text-primary" : "text-muted-foreground"}`} />
                          <span className={`text-sm font-medium ${theme === value ? "text-primary" : "text-muted-foreground"}`}>
                            {label}
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
