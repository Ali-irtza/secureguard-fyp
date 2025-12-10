import { useState } from "react";
import { User, Key, Bell, Copy, Eye, EyeOff, RefreshCw, Camera } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

const Settings = () => {
  // Profile state
  const [name, setName] = useState("Alex Johnson");
  const [email, setEmail] = useState("alex.johnson@secureguard.io");

  // API Key state
  const [apiKey] = useState("sg_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456");
  const [showKey, setShowKey] = useState(false);

  // Notification state
  const [notifications, setNotifications] = useState({
    criticalAlerts: true,
    weeklySummary: true,
    scanCompleted: false,
    newProject: false,
  });

  const handleSaveProfile = () => {
    toast.success("Profile updated successfully");
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    toast.success("API key copied to clipboard");
  };

  const handleRegenerateKey = () => {
    toast.success("New API key generated successfully");
  };

  const maskedKey = `${"•".repeat(32)}${apiKey.slice(-8)}`;

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
        <Tabs defaultValue="profile" orientation="vertical" className="flex flex-col lg:flex-row gap-6">
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
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-background/50 border-border/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Contact support to change your email address
                    </p>
                  </div>

                  <Button onClick={handleSaveProfile} className="bg-primary hover:bg-primary/90">
                    Save Changes
                  </Button>
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

                  {/* Weekly Summary */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="space-y-1">
                      <Label htmlFor="weekly-summary" className="font-medium">Weekly Summary</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive a weekly digest of all scan activities
                      </p>
                    </div>
                    <Switch
                      id="weekly-summary"
                      checked={notifications.weeklySummary}
                      onCheckedChange={(checked) =>
                        setNotifications({ ...notifications, weeklySummary: checked })
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

                  <Button onClick={() => toast.success("Notification preferences saved")} className="bg-primary hover:bg-primary/90">
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
