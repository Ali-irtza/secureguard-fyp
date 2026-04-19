import { useState, useEffect, useCallback } from "react";
import {
  Users, Crown, Pencil, Trash2, Lock, Github,
  Info, Eye, EyeOff, UserPlus, ExternalLink,
  RefreshCw, Plus, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  listTeams, createTeam, updateTeam, deleteTeam,
  connectGithub, refreshGithubBranches,
  inviteMember, updateMember, removeMember,
  type Team, type TeamRole,
} from "@/lib/teams-api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRoleBadgeClasses(role: TeamRole) {
  switch (role) {
    case "admin":     return "bg-primary/15 text-primary border-primary/30";
    case "developer": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "viewer":    return "bg-muted text-muted-foreground border-border/50";
  }
}

function getInitials(name: string | null, email: string | null): string {
  if (name) return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  if (email) return email[0].toUpperCase();
  return "?";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Team = () => {
  const { user } = useCurrentUser();

  // ── Data state ────────────────────────────────────────────────────────────
  const [teams, setTeams]               = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [loading, setLoading]           = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [createTeamOpen, setCreateTeamOpen]     = useState(false);
  const [newTeamName, setNewTeamName]           = useState("");
  const [inviteModalOpen, setInviteModalOpen]   = useState(false);
  const [inviteEmail, setInviteEmail]           = useState("");
  const [inviteRole, setInviteRole]             = useState<"developer" | "viewer">("developer");
  const [connectGithubOpen, setConnectGithubOpen] = useState(false);
  const [repoUrl, setRepoUrl]                   = useState("");
  const [repoPat, setRepoPat]                   = useState("");
  const [showPat, setShowPat]                   = useState(false);
  const [editingTeamName, setEditingTeamName]   = useState(false);
  const [tempTeamName, setTempTeamName]         = useState("");

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedTeam    = teams.find(t => t.id === selectedTeamId);
  const currentUserRole = selectedTeam?.current_user_role ?? "viewer";
  const isAdmin         = currentUserRole === "admin";

  // ── Load teams on mount ───────────────────────────────────────────────────
  const fetchTeams = useCallback(async () => {
    try {
      const data = await listTeams();
      setTeams(data);
      // Auto-select: prefer first admin team, else first team
      if (!selectedTeamId || !data.find(t => t.id === selectedTeamId)) {
        const adminTeam = data.find(t => t.current_user_role === "admin");
        setSelectedTeamId(adminTeam?.id ?? data[0]?.id ?? "");
      }
    } catch (err) {
      toast.error("Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId]);

  useEffect(() => { fetchTeams(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setActionLoading(true);
    try {
      const team = await createTeam(newTeamName.trim());
      setTeams(prev => [...prev, team]);
      setSelectedTeamId(team.id);
      toast.success(`Team "${team.name}" created`);
      setNewTeamName("");
      setCreateTeamOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create team");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenameTeam = async () => {
    if (!selectedTeam || !tempTeamName.trim()) return;
    setActionLoading(true);
    try {
      const updated = await updateTeam(selectedTeam.id, { name: tempTeamName.trim() });
      setTeams(prev => prev.map(t => t.id === updated.id ? updated : t));
      toast.success("Team renamed");
      setEditingTeamName(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to rename team");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConnectGithub = async () => {
    if (!selectedTeam || !repoUrl.trim() || !repoPat.trim()) return;
    setActionLoading(true);
    try {
      const updated = await connectGithub(selectedTeam.id, repoUrl.trim(), repoPat.trim());
      setTeams(prev => prev.map(t => t.id === updated.id ? updated : t));
      toast.success(`Repository connected — ${updated.github_branches.length} branches synced`);
      setRepoUrl("");
      setRepoPat("");
      setConnectGithubOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to connect repository");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshBranches = async () => {
    if (!selectedTeam || !selectedTeam.github_repo) return;
    // Need PAT again — open the connect modal pre-filled with the existing URL
    setRepoUrl(selectedTeam.github_repo);
    setConnectGithubOpen(true);
  };

  const handleDisconnectGithub = async () => {
    if (!selectedTeam) return;
    setActionLoading(true);
    try {
      const updated = await updateTeam(selectedTeam.id, { github_repo: "" });
      // Also clear branches locally
      setTeams(prev => prev.map(t =>
        t.id === selectedTeam.id
          ? { ...updated, github_branches: [] }
          : t
      ));
      toast.success("Repository disconnected");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to disconnect repository");
    } finally {
      setActionLoading(false);
    }
  };

  const handleInviteMember = async () => {
    if (!selectedTeam || !inviteEmail.trim()) return;
    setActionLoading(true);
    try {
      const member = await inviteMember(selectedTeam.id, inviteEmail.trim(), inviteRole);
      // Optimistically add the new member to local state
      setTeams(prev => prev.map(t =>
        t.id === selectedTeam.id
          ? { ...t, members: [...t.members, member], member_count: t.member_count + 1 }
          : t
      ));
      toast.success(`${member.profile.full_name ?? inviteEmail} added to team`);
      setInviteEmail("");
      setInviteRole("developer");
      setInviteModalOpen(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to invite member");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateMemberRole = async (memberUserId: string, role: TeamRole) => {
    if (!selectedTeam) return;
    try {
      const updated = await updateMember(selectedTeam.id, memberUserId, { role });
      setTeams(prev => prev.map(t =>
        t.id === selectedTeam.id
          ? { ...t, members: t.members.map(m => m.user_id === memberUserId ? updated : m) }
          : t
      ));
      toast.success("Role updated");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update role");
    }
  };

  const handleRemoveMember = async (memberUserId: string, memberName: string) => {
    if (!selectedTeam) return;
    try {
      await removeMember(selectedTeam.id, memberUserId);
      setTeams(prev => prev.map(t =>
        t.id === selectedTeam.id
          ? { ...t, members: t.members.filter(m => m.user_id !== memberUserId), member_count: t.member_count - 1 }
          : t
      ));
      toast.success(`${memberName} removed from team`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to remove member");
    }
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (teams.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <div className="p-6 rounded-full bg-muted/30 border border-border/30">
            <Users className="h-12 w-12 text-muted-foreground" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">No Team Yet</h2>
            <p className="text-muted-foreground max-w-md">
              Create a team to collaborate and manage branch scanning with your members
            </p>
          </div>
          <Button onClick={() => setCreateTeamOpen(true)} className="bg-primary hover:bg-primary/90 gap-2">
            <Users className="h-4 w-4" />
            Create Team
          </Button>

          <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Team</DialogTitle>
                <DialogDescription>Give your team a name to get started</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="team-name-empty">Team Name</Label>
                  <Input
                    id="team-name-empty"
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCreateTeam()}
                    placeholder="e.g. SecureGuard Team"
                    className="bg-background/50 border-border/50"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreateTeamOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateTeam} disabled={!newTeamName.trim() || actionLoading} className="bg-primary hover:bg-primary/90">
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Team"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Team switcher + Create button */}
        <div className="flex items-center gap-3 flex-wrap">
          {teams.length > 1 ? (
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="w-[300px] h-10 bg-card/50 border-border/50">
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent>
                {teams.map(team => (
                  <SelectItem key={team.id} value={team.id}>
                    <span className="flex items-center gap-2">
                      {team.current_user_role === "admin" && <Crown className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                      <span className="truncate">{team.name}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 capitalize ${getRoleBadgeClasses(team.current_user_role)}`}>
                        {team.current_user_role}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <h1 className="text-2xl lg:text-3xl font-bold">{selectedTeam?.name}</h1>
          )}
          <Button onClick={() => setCreateTeamOpen(true)} className="bg-primary hover:bg-primary/90 gap-2">
            <Plus className="h-4 w-4" />
            Create Team
          </Button>
        </div>

        {teams.length === 1 && (
          <p className="text-muted-foreground -mt-4">Team · {selectedTeam?.member_count} members</p>
        )}

        {/* Header with team name edit + action buttons */}
        {selectedTeam && (
          <div className="flex items-center justify-between flex-wrap gap-4">
            {teams.length > 1 && (
              <div>
                {editingTeamName && isAdmin ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={tempTeamName}
                      onChange={e => setTempTeamName(e.target.value)}
                      className="bg-background/50 border-border/50 h-9 w-64"
                      onKeyDown={e => {
                        if (e.key === "Enter") handleRenameTeam();
                        if (e.key === "Escape") setEditingTeamName(false);
                      }}
                      autoFocus
                    />
                    <Button size="sm" onClick={handleRenameTeam} disabled={actionLoading} className="bg-primary hover:bg-primary/90">
                      {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingTeamName(false)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl lg:text-3xl font-bold">{selectedTeam.name}</h1>
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
                <p className="text-muted-foreground mt-1">Team · {selectedTeam.member_count} members</p>
              </div>
            )}

            {isAdmin && (
              <div className="flex items-center gap-3 ml-auto">
                <Button variant="outline" onClick={() => setConnectGithubOpen(true)} className="gap-2">
                  <Github className="h-4 w-4" />
                  {selectedTeam.github_repo ? "Manage Repo" : "Connect GitHub Repo"}
                </Button>
                <Button onClick={() => setInviteModalOpen(true)} className="bg-primary hover:bg-primary/90 gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invite Member
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Non-admin info banner */}
        {!isAdmin && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border/30">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">Only the team Admin can manage members and roles.</p>
          </div>
        )}

        {/* Members table */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle>Members</CardTitle>
              <Badge variant="outline" className="bg-muted/50 border-border/50">
                {selectedTeam?.member_count ?? 0} members
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
                  {isAdmin && <TableHead className="w-16">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedTeam?.members.map(member => {
                  const isSelf = member.user_id === user?.id;
                  const displayName = member.profile.full_name ?? member.profile.email ?? "Unknown";
                  const initials = getInitials(member.profile.full_name, member.profile.email);

                  return (
                    <TableRow
                      key={member.id}
                      className={`border-border/30 hover:bg-muted/10 ${isSelf ? "border-l-2 border-l-primary" : ""}`}
                    >
                      {/* Member info */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member.profile.avatar_url ?? undefined} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{displayName}</span>
                              {isSelf && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/30">You</Badge>
                              )}
                            </div>
                            {member.profile.email && (
                              <span className="text-xs text-muted-foreground">{member.profile.email}</span>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Role */}
                      <TableCell>
                        {isAdmin && !isSelf ? (
                          <Select
                            value={member.role}
                            onValueChange={val => handleUpdateMemberRole(member.user_id, val as TeamRole)}
                          >
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
                          <Badge variant="outline" className={`text-xs ${getRoleBadgeClasses(member.role)}`}>
                            {member.role}
                          </Badge>
                        )}
                      </TableCell>

                      {/* Branch */}
                      <TableCell>
                        {member.role === "admin" ? (
                          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">All Branches</Badge>
                        ) : member.role === "viewer" ? (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Lock className="h-3 w-3" />
                            <span className="text-xs">No branch</span>
                          </div>
                        ) : isAdmin && !isSelf && selectedTeam.github_branches.length > 0 ? (
                          // Admin can assign a real branch from the synced list
                          <Select
                            value={member.branch ?? ""}
                            onValueChange={val =>
                              updateMember(selectedTeam.id, member.user_id, { branch: val })
                                .then(updated =>
                                  setTeams(prev => prev.map(t =>
                                    t.id === selectedTeam.id
                                      ? { ...t, members: t.members.map(m => m.user_id === member.user_id ? updated : m) }
                                      : t
                                  ))
                                )
                                .catch(err => toast.error(err.message ?? "Failed to assign branch"))
                            }
                          >
                            <SelectTrigger className="w-44 h-8 bg-background/50 border-border/50 text-xs">
                              <SelectValue placeholder="Assign branch…" />
                            </SelectTrigger>
                            <SelectContent>
                              {selectedTeam.github_branches.map(branch => (
                                <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : isAdmin && !isSelf && !selectedTeam.github_repo ? (
                          <span className="text-xs text-muted-foreground italic">Connect repo first</span>
                        ) : (
                          <span className="text-sm text-foreground">{member.branch ?? "—"}</span>
                        )}
                      </TableCell>

                      {/* Actions */}
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
                                  <AlertDialogTitle>Remove {displayName}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove their access to all team projects and scans.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleRemoveMember(member.user_id, displayName)}
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    Remove
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

        {/* GitHub Repository card */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>GitHub Repository</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedTeam?.github_repo ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Github className="h-5 w-5 text-foreground" />
                  <a
                    href={selectedTeam.github_repo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm flex items-center gap-1"
                  >
                    {selectedTeam.github_repo.replace("https://github.com/", "")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <Badge className="bg-primary/15 text-primary border-primary/30 text-xs">Connected</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{selectedTeam.github_branches.length} branches synced</span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" className="gap-2" onClick={handleRefreshBranches}>
                      <RefreshCw className="h-4 w-4" />
                      Refresh Branches
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={handleDisconnectGithub}
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
                  <p className="font-medium">No repository connected</p>
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

      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {/* Invite Member */}
      <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>Add a new member to your team by their email address</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleInviteMember()}
                placeholder="colleague@company.com"
                className="bg-background/50 border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-3">
                {(["developer", "viewer"] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setInviteRole(r)}
                    className={`p-3 rounded-xl border text-center transition-all capitalize ${
                      inviteRole === r
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border/50 bg-card/50 text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                  >
                    <span className="text-sm font-medium">{r}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">The user must already have an account in SecureGuard Pro.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteModalOpen(false)}>Cancel</Button>
            <Button onClick={handleInviteMember} disabled={!inviteEmail.trim() || actionLoading} className="bg-primary hover:bg-primary/90">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connect GitHub */}
      <Dialog open={connectGithubOpen} onOpenChange={setConnectGithubOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedTeam?.github_repo ? "Refresh GitHub Branches" : "Connect GitHub Repository"}
            </DialogTitle>
            <DialogDescription>
              {selectedTeam?.github_repo
                ? "Enter your PAT to re-sync the branch list. It will not be stored."
                : "Link a repository for branch-based scanning"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="repo-url">Repository URL</Label>
              <Input
                id="repo-url"
                value={repoUrl}
                onChange={e => setRepoUrl(e.target.value)}
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
                  onChange={e => setRepoPat(e.target.value)}
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
              <p className="text-xs text-muted-foreground">Needs read-only repo scope. Never stored — used once to fetch branches.</p>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">We only read your code for scanning. We never modify your repository.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setConnectGithubOpen(false); setRepoPat(""); }}>Cancel</Button>
            <Button
              onClick={handleConnectGithub}
              disabled={!repoUrl.trim() || !repoPat.trim() || actionLoading}
              className="bg-primary hover:bg-primary/90"
            >
              {actionLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : selectedTeam?.github_repo ? "Refresh Branches" : "Connect Repository"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Team */}
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
                onChange={e => setNewTeamName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreateTeam()}
                placeholder="e.g. SecureGuard Team"
                className="bg-background/50 border-border/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateTeamOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTeam} disabled={!newTeamName.trim() || actionLoading} className="bg-primary hover:bg-primary/90">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
};

export default Team;
