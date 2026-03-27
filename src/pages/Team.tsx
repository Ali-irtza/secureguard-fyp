import { useState, useMemo } from "react";
import { Users, Crown, Pencil, Trash2, Lock, Github, Info, Eye, EyeOff, UserPlus, ExternalLink, RefreshCw, Plus } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import TeamHealthOverview from "@/components/dashboard/TeamHealthOverview";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
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

const Team = () => {
  const userTeams = useMemo(() => mockTeams.filter(t => t.members.some(m => m.id === CURRENT_USER_ID)), []);
  const hasTeams = userTeams.length > 0;

  // Default to first admin team, else first team
  const defaultTeamId = useMemo(() => {
    const adminTeam = userTeams.find(t => t.currentUserRole === "admin");
    return adminTeam?.id || userTeams[0]?.id || "";
  }, [userTeams]);

  const [selectedTeamId, setSelectedTeamId] = useState(defaultTeamId);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
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

  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case "admin": return "bg-primary/15 text-primary border-primary/30";
      case "developer": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
      case "viewer": return "bg-muted text-muted-foreground border-border/50";
      default: return "bg-muted text-muted-foreground border-border/50";
    }
  };

  const getMemberRole = (member: typeof selectedTeam extends { members: (infer M)[] } | undefined ? M : never, index: number) => {
    const isSelf = member.id === CURRENT_USER_ID;
    if (isSelf) return currentUserRole;
    if (index === 0) return selectedTeam?.currentUserRole === "admin" ? "developer" : "developer";
    if (member.healthScore === null) return "viewer";
    return "developer";
  };

  const handleCreateTeam = () => {
    if (!newTeamName.trim()) return;
    toast.success(`Team "${newTeamName}" created successfully`);
    setNewTeamName("");
    setCreateTeamOpen(false);
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

  // Empty state — no teams
  if (!hasTeams) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <div className="p-6 rounded-full bg-muted/30 border border-border/30">
            <Users className="h-12 w-12 text-muted-foreground" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">No Team Yet</h2>
            <p className="text-muted-foreground max-w-md">
              Create a team to collaborate and manage branch scanning with your members
            </p>
          </div>
          <Button onClick={() => setCreateTeamOpen(true)} className="bg-primary hover:bg-primary/90 gap-2">
            <Users className="h-4 w-4" />
            Create Team
          </Button>

          {/* Create Team Modal */}
          <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Team</DialogTitle>
                <DialogDescription>Give your team a name to get started</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="team-name">Team Name</Label>
                  <Input
                    id="team-name"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="e.g. SecureGuard Team"
                    className="bg-background/50 border-border/50"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreateTeamOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleCreateTeam}
                  disabled={!newTeamName.trim()}
                  className="bg-primary hover:bg-primary/90"
                >
                  Create Team
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Team Switcher Dropdown + Create Team Button */}
        <div className="flex items-center gap-3">
          {userTeams.length > 1 ? (
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="w-[300px] h-10 bg-card/50 border-border/50">
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent>
                {userTeams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    <span className="flex items-center gap-2">
                      {team.currentUserRole === "admin" && <Crown className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                      <span className="truncate">{team.name}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 capitalize ${getRoleBadgeClasses(team.currentUserRole)}`}>
                        {team.currentUserRole}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{selectedTeam?.name}</h1>
          )}
          <Button onClick={() => setCreateTeamOpen(true)} className="bg-primary hover:bg-primary/90 gap-2">
            <Plus className="h-4 w-4" />
            Create Team
          </Button>
        </div>
        {userTeams.length === 1 && (
          <p className="text-muted-foreground -mt-4">Team · {selectedTeam?.members.length} members</p>
        )}

        {/* Page Header */}
        {userTeams.length > 1 && selectedTeam && (
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              {editingTeamName && isAdmin ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={tempTeamName}
                    onChange={(e) => setTempTeamName(e.target.value)}
                    className="bg-background/50 border-border/50 h-9 w-64"
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
                  <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{selectedTeam.name}</h1>
                  {isAdmin && (
                    <button
                      onClick={() => { setTempTeamName(selectedTeam.name); setEditingTeamName(true); }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-muted-foreground mt-1">Team · {selectedTeam.members.length} members</p>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => setConnectGithubOpen(true)} className="gap-2">
                  <Github className="h-4 w-4" />
                  Connect GitHub Repo
                </Button>
                <Button onClick={() => setInviteModalOpen(true)} className="bg-primary hover:bg-primary/90 gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invite Member
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Single team — header with actions */}
        {userTeams.length === 1 && isAdmin && (
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setConnectGithubOpen(true)} className="gap-2">
              <Github className="h-4 w-4" />
              Connect GitHub Repo
            </Button>
            <Button onClick={() => setInviteModalOpen(true)} className="bg-primary hover:bg-primary/90 gap-2">
              <UserPlus className="h-4 w-4" />
              Invite Member
            </Button>
          </div>
        )}

        {/* Non-admin info banner */}
        {!isAdmin && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border/30">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">Only the team Admin can manage members and roles.</p>
          </div>
        )}

        {/* Members Card */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle>Members</CardTitle>
              <Badge variant="outline" className="bg-muted/50 border-border/50">
                {selectedTeam?.members.length || 0} members
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Assigned Branch</TableHead>
                  <TableHead>Last Scan</TableHead>
                  {isAdmin && <TableHead className="w-16">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedTeam?.members.map((member, index) => {
                  const isSelf = member.id === CURRENT_USER_ID;
                  const displayRole = getMemberRole(member, index);

                  return (
                    <TableRow
                      key={member.id}
                      className={`border-border/30 hover:bg-muted/10 ${isSelf ? "border-l-2 border-l-primary" : ""}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                              {member.initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{member.name}</span>
                              {isSelf && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/30">You</Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {member.name.toLowerCase().replace(" ", ".")}@email.com
                            </span>
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
                          selectedTeam?.githubRepo ? (
                            <Select defaultValue={member.branch}>
                              <SelectTrigger className="w-44 h-8 bg-background/50 border-border/50 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {selectedTeam.branches?.map((branch) => (
                                  <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Connect repo first</span>
                          )
                        ) : (
                          <span className="text-sm text-foreground">{member.branch}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {member.lastScan || "Never"}
                        </span>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          {!isSelf && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove {member.name} from the team?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove their access to all team projects and scans.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => toast.success(`${member.name} removed from team`)}
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    Confirm
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
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

        {/* GitHub Repository Card */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>GitHub Repository</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedTeam?.githubRepo ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Github className="h-5 w-5 text-foreground" />
                  <a
                    href={selectedTeam.githubRepo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm flex items-center gap-1"
                  >
                    {selectedTeam.githubRepo.replace("https://github.com/", "")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <Badge className="bg-primary/15 text-primary border-primary/30 text-xs">Connected</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Connected on Jan 15, 2024</span>
                  <span>·</span>
                  <span>{selectedTeam.branches?.length || 0} branches synced</span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" className="gap-2" onClick={() => toast.success("Branches refreshed")}>
                      <RefreshCw className="h-4 w-4" />
                      Refresh Branches
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => toast.success("Repository disconnected")}
                    >
                      Disconnect
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-border/50 rounded-lg p-8 flex flex-col items-center gap-4">
                <Github className="h-10 w-10 text-muted-foreground" />
                <div className="text-center space-y-1">
                  <p className="font-medium text-foreground">No repository connected</p>
                  <p className="text-sm text-muted-foreground">
                    Connect a GitHub repository to enable branch-based scanning for your team
                  </p>
                </div>
                {isAdmin && (
                  <Button onClick={() => setConnectGithubOpen(true)} className="bg-primary hover:bg-primary/90 gap-2">
                    <Github className="h-4 w-4" />
                    Connect Repository
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Health Summary */}
        {selectedTeam && (
          <TeamHealthOverview
            team={selectedTeam}
            currentUserId={CURRENT_USER_ID}
            userRole={currentUserRole}
          />
        )}

      </div>

      {/* Invite Member Modal */}
      <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>Add a new member to your team</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Enter email address"
                className="bg-background/50 border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setInviteRole("developer")}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    inviteRole === "developer"
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <span className="text-sm font-medium">Developer</span>
                </button>
                <button
                  onClick={() => setInviteRole("viewer")}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    inviteRole === "viewer"
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <span className="text-sm font-medium">Viewer</span>
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">An invite link will be sent to their email address</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleInviteMember}
              disabled={!inviteEmail}
              className="bg-primary hover:bg-primary/90"
            >
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connect GitHub Modal */}
      <Dialog open={connectGithubOpen} onOpenChange={setConnectGithubOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect GitHub Repository</DialogTitle>
            <DialogDescription>Link a repository for branch-based scanning</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="repo-url">Repository URL</Label>
              <Input
                id="repo-url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/username/repo"
                className="bg-background/50 border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repo-pat">Personal Access Token</Label>
              <div className="relative">
                <Input
                  id="repo-pat"
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
              <p className="text-xs text-muted-foreground">Needs read-only repo scope only</p>
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
            <Button
              onClick={handleConnectGithub}
              disabled={!repoUrl}
              className="bg-primary hover:bg-primary/90"
            >
              Connect Repository
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Team Modal */}
      <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Team</DialogTitle>
            <DialogDescription>Give your team a name to get started</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-team-name">Team Name</Label>
              <Input
                id="create-team-name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g. SecureGuard Team"
                className="bg-background/50 border-border/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateTeamOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateTeam}
              disabled={!newTeamName.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              Create Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Team;
