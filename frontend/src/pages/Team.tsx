import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users, Crown, Pencil, Trash2, Lock, Github,
  Info, Eye, EyeOff, UserPlus, ExternalLink,
  RefreshCw, Plus, Loader2, GitBranch, Check, ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import BranchFileExplorer from "@/components/dashboard/BranchFileExplorer";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  listTeams, createTeam, updateTeam, deleteTeam,
  connectGithub, refreshGithubBranches,
  getGithubAuthorizeUrl, listGithubRepos, selectGithubRepo,
  syncBranches,
  inviteMember, updateMember, removeMember,
  type Team, type TeamRole, type TeamMember,
} from "@/lib/teams-api";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { parsePgTextArray } from "@/types/realtime";
import type { TeamMemberRecord } from "@/types/realtime";

// ---------------------------------------------------------------------------
// BranchAssignDropdown — matches the role Select dropdown in style
// Batches selections locally; only calls onSave when the popover closes.
// ---------------------------------------------------------------------------

interface BranchAssignDropdownProps {
  branches: string[];
  assigned: string[];
  onSave: (branches: string[]) => void;
}

function BranchAssignDropdown({ branches, assigned, onSave }: BranchAssignDropdownProps) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<string[]>(assigned);

  // Sync local state when the server-confirmed assigned list changes.
  // Compare by value (not reference) so that a new `[]` from `?? []` at the
  // call site doesn't reset an in-progress selection on every parent re-render.
  const assignedKey = assigned.slice().sort().join("\0");
  const prevAssignedKey = useRef(assignedKey);
  useEffect(() => {
    if (assignedKey !== prevAssignedKey.current) {
      prevAssignedKey.current = assignedKey;
      setLocal(assigned);
    }
  }, [assignedKey, assigned]);

  const toggle = (branch: string) => {
    setLocal(prev =>
      prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]
    );
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Save when closing if anything changed
    if (!next) {
      const changed =
        local.length !== assigned.length ||
        local.some(b => !assigned.includes(b));
      if (changed) onSave(local);
    }
  };

  const label = local.length === 0
    ? "No branches"
    : local.length === 1
    ? local[0]
    : `${local.length} branches`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-44 h-8 justify-between bg-background/50 border-border/50 text-xs font-normal hover:bg-accent hover:text-accent-foreground hover:translate-y-0 hover:shadow-none active:scale-100"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <p className="text-xs font-medium text-muted-foreground px-1.5 pb-1.5 border-b border-border/50 mb-1.5">
          Assign branches
        </p>
        <div className="space-y-0.5 max-h-52 overflow-y-auto">
          {branches.map(branch => {
            const checked = local.includes(branch);
            return (
              <button
                key={branch}
                onClick={() => toggle(branch)}
                className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-left"
              >
                <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  checked ? "bg-primary border-primary" : "border-border/70 bg-background"
                }`}>
                  {checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                </div>
                <GitBranch className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground truncate">{branch}</span>
              </button>
            );
          })}
        </div>
        {local.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-border/50">
            <button
              onClick={() => setLocal([])}
              className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors text-left px-1.5 py-1"
            >
              Clear all
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

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
  const [refreshing, setRefreshing]     = useState(false);

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

  // ── GitHub OAuth state ────────────────────────────────────────────────────
  const [repoPicker, setRepoPicker]             = useState(false);
  const [githubRepos, setGithubRepos]           = useState<{ full_name: string; private: boolean; url: string }[]>([]);
  const [reposLoading, setReposLoading]         = useState(false);

  // ── UI state ───────────────────────────────────────────────────────────────

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedTeam    = teams.find(t => t.id === selectedTeamId);
  const currentUserRole = selectedTeam?.current_user_role ?? "viewer";
  const isAdmin         = currentUserRole === "admin";

  // ── Realtime: live team_members sync ─────────────────────────────────────
  // CDC events carry raw DB columns (id, user_id, role, branches, team_id).
  // For UPDATE: merge role + branches into the existing TeamMember (preserves
  //   the profile sub-object which CDC doesn't carry).
  // For DELETE: remove the member by matching on the CDC row's id field.
  // For INSERT: a new member was added by another admin — re-fetch the team
  //   so we get the full profile data alongside the new row.
  useRealtimeSync<TeamMemberRecord>({
    table: "team_members",
    filter: selectedTeamId ? `team_id=eq.${selectedTeamId}` : undefined,
    enabled: !!selectedTeamId,

    onInsert: () => {
      // Re-fetch to get the full member object including profile join
      fetchTeams();
    },

    onUpdate: (event) => {
      const { user_id, role, branches } = event.new;
      // branches arrives from the CDC WebSocket as a raw Postgres braced
      // string (e.g. "{main,development}") — parse it into a JS array first.
      const parsedBranches = parsePgTextArray(branches as string[] | string | null);
      setTeams(prev => prev.map(team =>
        team.id !== selectedTeamId ? team : {
          ...team,
          members: team.members.map((m): TeamMember =>
            m.user_id === user_id
              ? { ...m, role: role as TeamRole, branches: parsedBranches }
              : m
          ),
        }
      ));
    },

    onDelete: (event) => {
      // event.old contains the deleted row — match by the junction row id
      const deletedId = event.old.id;
      if (!deletedId) return;
      setTeams(prev => prev.map(team =>
        team.id !== selectedTeamId ? team : {
          ...team,
          members: team.members.filter(m => m.id !== deletedId),
          member_count: Math.max(0, team.member_count - 1),
        }
      ));
    },
  });

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
    setRefreshing(true);
    try {
      const updated = await syncBranches(selectedTeam.id);
      setTeams(prev => prev.map(t => t.id === updated.id ? updated : t));
      toast.success(`Successfully synced ${updated.github_branches.length} branches from GitHub`);
    } catch (err: any) {
      toast.error(err.message || "Failed to sync branches from GitHub");
    } finally {
      setRefreshing(false);
    }
  };

  // ── GitHub OAuth handlers ─────────────────────────────────────────────────

  const handleGithubOAuth = async () => {
    if (!selectedTeam) return;
    setActionLoading(true);
    try {
      const url = await getGithubAuthorizeUrl(selectedTeam.id);
      // Redirect the browser to GitHub's authorization page
      window.location.href = url;
    } catch (err: any) {
      toast.error(err.message ?? "Failed to start GitHub authorization");
      setActionLoading(false);
    }
  };

  const handleOAuthCallback = useCallback(async (teamId: string) => {
    // Called when user returns from GitHub OAuth — load their repos
    setReposLoading(true);
    try {
      const repos = await listGithubRepos(teamId);
      
      if (repos.length === 1) {
        // Auto-connect if exactly one repository is selected
        setActionLoading(true);
        try {
          const updated = await selectGithubRepo(teamId, repos[0].full_name, repos[0].url);
          setTeams(prev => prev.map(t => t.id === updated.id ? updated : t));
          toast.success(`Connected ${repos[0].full_name} — ${updated.github_branches.length} branches synced`);
        } catch (err: any) {
          toast.error(err.message ?? "Failed to connect repository");
        } finally {
          setActionLoading(false);
        }
      } else {
        // Multiple repos selected, show the picker modal
        setGithubRepos(repos);
        setRepoPicker(true);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to load repositories");
      setRepoPicker(false);
    } finally {
      setReposLoading(false);
    }
  }, []);

  const handleSelectRepo = async (repoFullName: string, repoUrl: string) => {
    if (!selectedTeam) return;
    setActionLoading(true);
    try {
      const updated = await selectGithubRepo(selectedTeam.id, repoFullName, repoUrl);
      setTeams(prev => prev.map(t => t.id === updated.id ? updated : t));
      toast.success(`Connected ${repoFullName} — ${updated.github_branches.length} branches synced`);
      setRepoPicker(false);
      setGithubRepos([]);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to connect repository");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle OAuth redirect back from GitHub
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const githubConnected = params.get("github_connected");
    const teamId          = params.get("team_id");
    const githubError     = params.get("github_error");

    if (githubError) {
      toast.error(`GitHub connection failed: ${githubError.replace(/_/g, " ")}`);
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (githubConnected === "true" && teamId) {
      // Clean URL first
      window.history.replaceState({}, "", window.location.pathname);
      // Select the team that just connected
      setSelectedTeamId(teamId);
      // Load repo picker
      handleOAuthCallback(teamId);
    }
  }, [handleOAuthCallback]);

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

    // Snapshot for rollback
    const snapshot = teams;

    // Optimistic update — apply role change immediately
    setTeams(prev => prev.map(t =>
      t.id !== selectedTeam.id ? t : {
        ...t,
        members: t.members.map(m =>
          m.user_id === memberUserId ? { ...m, role } : m
        ),
      }
    ));

    try {
      const updated = await updateMember(selectedTeam.id, memberUserId, { role });
      // Reconcile with server response to pick up any server-side fields
      setTeams(prev => prev.map(t =>
        t.id !== selectedTeam.id ? t : {
          ...t,
          members: t.members.map(m => m.user_id === memberUserId ? updated : m),
        }
      ));
      toast.success("Role updated");
    } catch (err: any) {
      // Rollback to snapshot
      setTeams(snapshot);
      toast.error(err.message ?? "Failed to update role");
    }
  };

  const handleUpdateMemberBranches = async (memberUserId: string, branches: string[]) => {
    if (!selectedTeam) return;

    // Snapshot for rollback
    const snapshot = teams;

    // Optimistic update — apply branch change immediately
    setTeams(prev => prev.map(t =>
      t.id !== selectedTeam.id ? t : {
        ...t,
        members: t.members.map(m =>
          m.user_id === memberUserId ? { ...m, branches } : m
        ),
      }
    ));

    try {
      const updated = await updateMember(selectedTeam.id, memberUserId, { branches });
      // Reconcile with server response
      setTeams(prev => prev.map(t =>
        t.id !== selectedTeam.id ? t : {
          ...t,
          members: t.members.map(m => m.user_id === memberUserId ? updated : m),
        }
      ));
      toast.success("Branches updated");
    } catch (err: any) {
      // Rollback to snapshot
      setTeams(snapshot);
      toast.error(err.message ?? "Failed to update branches");
    }
  };

  const handleRemoveMember = async (memberUserId: string, memberName: string) => {
    if (!selectedTeam) return;

    // Snapshot for rollback
    const snapshot = teams;

    // Optimistic update — remove member immediately
    setTeams(prev => prev.map(t =>
      t.id !== selectedTeam.id ? t : {
        ...t,
        members: t.members.filter(m => m.user_id !== memberUserId),
        member_count: Math.max(0, t.member_count - 1),
      }
    ));

    try {
      await removeMember(selectedTeam.id, memberUserId);
      toast.success(`${memberName} removed from team`);
    } catch (err: any) {
      // Rollback to snapshot
      setTeams(snapshot);
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
                <Button variant="outline" onClick={handleGithubOAuth} disabled={actionLoading} className="gap-2">
                  <Github className="h-4 w-4" />
                  {selectedTeam.github_repo ? "Reconnect GitHub" : "Connect with GitHub"}
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
                  <TableHead>Assigned Branches</TableHead>
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
                            <SelectTrigger className="w-32 h-8 bg-background/50 border-border/50 text-xs hover:bg-accent hover:text-accent-foreground">
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
                          <BranchAssignDropdown
                            branches={selectedTeam.github_branches}
                            assigned={member.branches ?? []}
                            onSave={(newBranches) => handleUpdateMemberBranches(member.user_id, newBranches)}
                          />
                        ) : isAdmin && !isSelf && !selectedTeam.github_repo ? (
                          <span className="text-xs text-muted-foreground italic">Connect repo first</span>
                        ) : member.branches && member.branches.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {member.branches.map(branch => (
                              <Badge key={branch} variant="outline" className="text-xs">
                                {branch}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
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
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">{selectedTeam.github_branches.length} branches synced</span>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-2">
                    {selectedTeam.github_branches.map(branch => (
                      <Badge key={branch} variant="secondary" className="text-[10px] font-normal bg-muted/50 hover:bg-muted/80">
                        {branch}
                      </Badge>
                    ))}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" className="gap-2" onClick={handleRefreshBranches} disabled={refreshing}>
                      {refreshing
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <RefreshCw className="h-4 w-4" />
                      }
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
                  <Button onClick={handleGithubOAuth} disabled={actionLoading} className="bg-primary hover:bg-primary/90 gap-2">
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                    Connect with GitHub
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Branch File Explorer */}
        {selectedTeam && selectedTeam.github_repo && (
          <BranchFileExplorer
            team={selectedTeam}
            currentUserRole={currentUserRole}
            currentUserBranches={
              selectedTeam.members.find(m => m.user_id === user?.id)?.branches ?? null
            }
          />
        )}

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

      {/* Connect GitHub — PAT fallback (kept for manual/private use) */}
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

      {/* GitHub Repo Picker — shown after OAuth callback */}
      <Dialog open={repoPicker} onOpenChange={open => { if (!open) { setRepoPicker(false); setGithubRepos([]); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select a Repository</DialogTitle>
            <DialogDescription>
              Choose which repository to connect to this team
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {reposLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : githubRepos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No repositories found.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
                {githubRepos.map(repo => (
                  <button
                    key={repo.full_name}
                    onClick={() => handleSelectRepo(repo.full_name, repo.url)}
                    disabled={actionLoading}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Github className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{repo.full_name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {repo.private && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Private</Badge>
                      )}
                      <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Connect →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRepoPicker(false); setGithubRepos([]); }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
};

export default Team;