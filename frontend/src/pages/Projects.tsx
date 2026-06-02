import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, FolderOpen, Eye, RotateCcw, Trash2, Plus,
  ChevronUp, ChevronDown, Clock, AlertTriangle,
  Shield, ShieldAlert, ShieldCheck, ShieldX,
  User, Users, Crown, Info, WifiOff,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  listProjects, createProject, deleteProject, bulkDeleteProjects,
  type Project, type CreateProjectPayload,
} from "@/lib/projects-api";
import { listTeams, type Team, type TeamRole } from "@/lib/teams-api";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import {
  type ProjectRecord, shouldApplyCdcEvent,
  applyOptimisticInsert, applyOptimisticUpdate, applyOptimisticDelete,
} from "@/types/realtime";

type SortField = "name" | "language" | "updated_at" | "health_score";
type SortDirection = "asc" | "desc";

const languageBadgeStyles: Record<string, string> = {
  C: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  "C++": "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

const healthScoreStyles: Record<string, string> = {
  A: "bg-green-500/20 text-green-400 border-green-500/30",
  B: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  C: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  D: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  F: "bg-red-500/20 text-red-400 border-red-500/30",
};

const healthScoreOrder: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, F: 5 };

const roleBadgeStyles: Record<TeamRole, string> = {
  admin: "bg-primary/20 text-primary border-primary/30",
  developer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  viewer: "bg-muted text-muted-foreground border-border",
};

const Projects = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // ── Core data state ──────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // ── UI / filter state ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"all" | "personal" | "team">("all");
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Modal state ──────────────────────────────────────────────────────
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectLanguage, setNewProjectLanguage] = useState<"C" | "C++" | "">("");
  const [newProjectType, setNewProjectType] = useState<"personal" | "team">("personal");
  const [newProjectTeamId, setNewProjectTeamId] = useState("");

  const hasTeams = userTeams.length > 0;

  // ── Initial data load ────────────────────────────────────────────────
  const load = async (cancelled: { current: boolean }) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const [projectsData, teamsData] = await Promise.all([
        listProjects(),
        listTeams(),
      ]);
      if (!cancelled.current) {
        setProjects(projectsData);
        setUserTeams(teamsData);
        setUserId(session?.user?.id ?? null);
        setIsLoading(false);
      }
    } catch (err) {
      if (!cancelled.current) {
        setError(err instanceof Error ? err.message : "Failed to load projects");
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const cancelled = { current: false };
    load(cancelled);
    return () => { cancelled.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Realtime CDC subscription ────────────────────────────────────────
  const { status: realtimeStatus } = useRealtimeSync<ProjectRecord>({
    table: "projects",
    filter: userId ? `owner_id=eq.${userId}` : undefined,
    enabled: !isLoading && !error && !!userId,
    onInsert: (event) => {
      setProjects((prev) => {
        const local = prev.find((p) => p.id === event.new.id);
        if (!shouldApplyCdcEvent(
          local ? { ...local, updated_at: local.updated_at } as unknown as ProjectRecord : undefined,
          event.new,
        )) return prev;
        return applyOptimisticInsert(prev as unknown as ProjectRecord[], event.new) as unknown as Project[];
      });
    },
    onUpdate: (event) => {
      setProjects((prev) => {
        const local = prev.find((p) => p.id === event.new.id);
        if (!shouldApplyCdcEvent(
          local ? { ...local, updated_at: local.updated_at } as unknown as ProjectRecord : undefined,
          event.new,
        )) return prev;
        return applyOptimisticUpdate(prev as unknown as ProjectRecord[], event.new) as unknown as Project[];
      });
    },
    onDelete: (event) => {
      const deletedId = (event.old as Partial<ProjectRecord>).id;
      if (deletedId) {
        setProjects((prev) =>
          applyOptimisticDelete(prev as unknown as ProjectRecord[], deletedId) as unknown as Project[]
        );
      }
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────────
  const getDaysSinceLastScan = (dateString: string): number => {
    const scanDate = new Date(dateString);
    const today = new Date();
    return Math.floor((today.getTime() - scanDate.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getStaleStatus = (dateString: string): "fresh" | "stale" | "critical" => {
    const days = getDaysSinceLastScan(dateString);
    if (days >= 14) return "critical";
    if (days >= 7) return "stale";
    return "fresh";
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });

  // ── Stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const healthy = projects.filter(p => p.health_score === "A" || p.health_score === "B").length;
    const needsAttention = projects.filter(p => p.health_score === "C" || p.health_score === "D").length;
    const critical = projects.filter(p => p.health_score === "F").length;
    return { total: projects.length, healthy, needsAttention, critical };
  }, [projects]);

  // ── Filter + sort ────────────────────────────────────────────────────
  const filteredProjects = useMemo(() => {
    let result = projects.filter((project) => {
      const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLanguage = languageFilter === "all" || project.language === languageFilter;
      const matchesHealth = healthFilter === "all" ||
        (healthFilter === "healthy" && (project.health_score === "A" || project.health_score === "B")) ||
        (healthFilter === "attention" && (project.health_score === "C" || project.health_score === "D")) ||
        (healthFilter === "critical" && project.health_score === "F");
      const matchesType = projectTypeFilter === "all" || project.type === projectTypeFilter;
      return matchesSearch && matchesLanguage && matchesHealth && matchesType;
    });

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name); break;
        case "language":
          comparison = (a.language ?? "").localeCompare(b.language ?? ""); break;
        case "updated_at":
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(); break;
        case "health_score":
          comparison = (healthScoreOrder[a.health_score ?? ""] ?? 99) -
                       (healthScoreOrder[b.health_score ?? ""] ?? 99); break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return result;
  }, [projects, searchQuery, languageFilter, healthFilter, projectTypeFilter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // ── Optimistic delete (single) ───────────────────────────────────────
  const handleDelete = async (projectId: string, projectName: string) => {
    const snapshot = [...projects];
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(projectId); return n; });
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out")), 15_000)
      );
      await Promise.race([deleteProject(projectId), timeout]);
      toast({ title: "Project Deleted", description: `"${projectName}" has been removed.` });
    } catch (err) {
      setProjects(snapshot);
      toast({
        title: "Delete Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  // ── Optimistic bulk delete ───────────────────────────────────────────
  const handleBulkDelete = async () => {
    const snapshot = [...projects];
    const selectionSnapshot = new Set(selectedIds);
    const ids = [...selectedIds];
    setProjects((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out")), 15_000)
      );
      const data = await Promise.race([bulkDeleteProjects(ids), timeout]);
      toast({ title: "Projects Deleted", description: `${data.deleted} project(s) have been removed.` });
    } catch (err) {
      setProjects(snapshot);
      setSelectedIds(selectionSnapshot);
      toast({
        title: "Bulk Delete Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleRescan = (projectName: string) => {
    navigate(`/new-scan?project=${encodeURIComponent(projectName)}`);
  };

  const handleBulkRescan = () => {
    toast({ title: "Bulk Re-scan Initiated", description: `Starting scans for ${selectedIds.size} project(s)...` });
    setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProjects.map((p) => p.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  // ── Optimistic create ────────────────────────────────────────────────
  const handleCreateProject = async () => {
    const snapshot = [...projects];
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticRecord: Project = {
      id: optimisticId,
      name: newProjectName.trim(),
      language: newProjectLanguage || null,
      health_score: null,
      type: newProjectType,
      owner_id: userId ?? "",
      team_id: newProjectType === "team" ? newProjectTeamId : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setProjects((prev) => [optimisticRecord, ...prev]);
    setIsCreateOpen(false);
    setNewProjectName("");
    setNewProjectLanguage("");
    setNewProjectType("personal");
    setNewProjectTeamId("");
    setIsCreating(true);
    try {
      const payload: CreateProjectPayload = {
        name: optimisticRecord.name,
        language: newProjectLanguage || undefined,
        type: newProjectType,
        team_id: newProjectType === "team" ? newProjectTeamId : undefined,
      };
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out")), 15_000)
      );
      const created = await Promise.race([createProject(payload), timeout]);
      setProjects((prev) => prev.map((p) => (p.id === optimisticId ? created : p)));
      toast({ title: "Project Created", description: `"${created.name}" has been created.` });
      navigate(`/projects/${created.id}`);
    } catch (err) {
      setProjects(snapshot);
      toast({
        title: "Create Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  // A team project can only be created if the user is an admin of the selected team.
  const adminTeamIds = new Set(userTeams.filter((t) => t.current_user_role === "admin").map((t) => t.id));

  const trimmedName = newProjectName.trim();
  const isValidName = trimmedName !== "" && /^[a-zA-Z]/.test(trimmedName);

  const canCreateProject =
    isValidName &&
    newProjectLanguage !== "" &&
    (
      newProjectType === "personal" ||
      (newProjectType === "team" && newProjectTeamId !== "" && adminTeamIds.has(newProjectTeamId))
    );

  const getEmptyStateMessage = () => {
    if (projectTypeFilter === "team") return "No team projects found. Create a project and assign it to a team.";
    if (projectTypeFilter === "personal") return "No personal projects found.";
    return null;
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="w-4 h-4 opacity-30" />;
    return sortDirection === "asc"
      ? <ChevronUp className="w-4 h-4 text-primary" />
      : <ChevronDown className="w-4 h-4 text-primary" />;
  };

  // ── Loading state ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-12"><Skeleton className="h-4 w-4" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-32" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                  <TableHead className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (error) {
    return (
      <DashboardLayout>
        <Card className="p-6 border-destructive/30 bg-destructive/5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive flex-1">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const cancelled = { current: false };
                load(cancelled);
              }}
            >
              Retry
            </Button>
          </div>
        </Card>
      </DashboardLayout>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────
  if (projects.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <FolderOpen className="w-16 h-16 text-muted-foreground/40" />
          <h2 className="text-xl font-semibold text-foreground">No Projects Yet</h2>
          <p className="text-muted-foreground text-sm">Create your first project to start scanning your code</p>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow-primary mt-2"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Project
          </Button>
        </div>
        <CreateProjectModal
          isOpen={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          projectName={newProjectName}
          onProjectNameChange={setNewProjectName}
          projectLanguage={newProjectLanguage}
          onProjectLanguageChange={setNewProjectLanguage}
          projectType={newProjectType}
          onProjectTypeChange={setNewProjectType}
          teamId={newProjectTeamId}
          onTeamIdChange={setNewProjectTeamId}
          userTeams={userTeams}
          hasTeams={hasTeams}
          canCreate={canCreateProject}
          isCreating={isCreating}
          onCreate={handleCreateProject}
        />
      </DashboardLayout>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Projects</h1>
              <p className="text-muted-foreground mt-1">Manage and monitor your code repositories</p>
            </div>
            {realtimeStatus !== "SUBSCRIBED" && (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 self-start mt-1">
                <WifiOff className="w-3 h-3 mr-1" />
                Reconnecting…
              </Badge>
            )}
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>

        {/* Quick Stats Banner */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 bg-card/50 border-border/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Shield className="w-5 h-5 text-primary" /></div>
              <div><p className="text-2xl font-bold text-foreground">{stats.total}</p><p className="text-sm text-muted-foreground">Total Projects</p></div>
            </div>
          </Card>
          <Card className="p-4 bg-card/50 border-border/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><ShieldCheck className="w-5 h-5 text-green-400" /></div>
              <div><p className="text-2xl font-bold text-green-400">{stats.healthy}</p><p className="text-sm text-muted-foreground">Healthy (A-B)</p></div>
            </div>
          </Card>
          <Card className="p-4 bg-card/50 border-border/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10"><ShieldAlert className="w-5 h-5 text-yellow-400" /></div>
              <div><p className="text-2xl font-bold text-yellow-400">{stats.needsAttention}</p><p className="text-sm text-muted-foreground">Needs Attention</p></div>
            </div>
          </Card>
          <Card className="p-4 bg-card/50 border-border/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10"><ShieldX className="w-5 h-5 text-red-400" /></div>
              <div><p className="text-2xl font-bold text-red-400">{stats.critical}</p><p className="text-sm text-muted-foreground">Critical (F)</p></div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search projects..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-card/50 border-border/50 focus:border-primary/50" />
          </div>
          <Select value={languageFilter} onValueChange={setLanguageFilter}>
            <SelectTrigger className="w-full sm:w-48 bg-card/50 border-border/50"><SelectValue placeholder="Filter by Language" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Languages</SelectItem>
              <SelectItem value="C">C</SelectItem>
              <SelectItem value="C++">C++</SelectItem>
            </SelectContent>
          </Select>
          <Select value={healthFilter} onValueChange={setHealthFilter}>
            <SelectTrigger className="w-full sm:w-48 bg-card/50 border-border/50"><SelectValue placeholder="Filter by Health" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scores</SelectItem>
              <SelectItem value="healthy">Healthy (A-B)</SelectItem>
              <SelectItem value="attention">Needs Attention (C-D)</SelectItem>
              <SelectItem value="critical">Critical (F)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={projectTypeFilter} onValueChange={(v) => setProjectTypeFilter(v as "all" | "personal" | "team")}>
            <SelectTrigger className="w-full sm:w-48 bg-card/50 border-border/50"><SelectValue placeholder="Filter by Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
              {hasTeams && <SelectItem value="team">Team</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-4 p-4 rounded-xl bg-primary/10 border border-primary/20 animate-in fade-in slide-in-from-top-2">
            <span className="text-sm font-medium text-foreground">{selectedIds.size} project(s) selected</span>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={handleBulkRescan} className="border-border/50">
                <RotateCcw className="w-4 h-4 mr-2" />Re-scan Selected
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="border-destructive/50 text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4 mr-2" />Delete Selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedIds.size} Project(s)</AlertDialogTitle>
                    <AlertDialogDescription>Are you sure you want to delete {selectedIds.size} selected project(s)? This action cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90">Delete All</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="w-12">
                  <Checkbox checked={filteredProjects.length > 0 && selectedIds.size === filteredProjects.length} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                </TableHead>
                <TableHead className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("name")}>
                  <div className="flex items-center gap-1">Project Name<SortIcon field="name" /></div>
                </TableHead>
                <TableHead className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("language")}>
                  <div className="flex items-center gap-1">Language<SortIcon field="language" /></div>
                </TableHead>
                <TableHead className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("updated_at")}>
                  <div className="flex items-center gap-1">Last Updated<SortIcon field="updated_at" /></div>
                </TableHead>
                <TableHead className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort("health_score")}>
                  <div className="flex items-center gap-1">Health Score<SortIcon field="health_score" /></div>
                </TableHead>
                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <FolderOpen className="w-10 h-10 text-muted-foreground/50" />
                      <p className="text-muted-foreground">{getEmptyStateMessage() || "No projects found"}</p>
                      {!getEmptyStateMessage() && <p className="text-sm text-muted-foreground/70">Try adjusting your search or filters</p>}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProjects.map((project) => {
                  const staleStatus = getStaleStatus(project.updated_at);
                  const teamName = userTeams.find((t) => t.id === project.team_id)?.name;
                  return (
                    <TableRow key={project.id} className="border-border/30 hover:bg-muted/10">
                      <TableCell>
                        <Checkbox checked={selectedIds.has(project.id)} onCheckedChange={() => toggleSelect(project.id)} aria-label={`Select ${project.name}`} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <FolderOpen className="w-4 h-4 text-primary flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{project.name}</span>
                              {project.type === "team" && (
                                <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0 h-4">Team</Badge>
                              )}
                            </div>
                            {project.type === "team" && teamName && (
                              <p className="text-xs text-muted-foreground mt-0.5">{teamName}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {project.language ? (
                          <Badge variant="outline" className={languageBadgeStyles[project.language] ?? ""}>{project.language}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{formatDate(project.updated_at)}</span>
                          {staleStatus === "stale" && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                                  <Clock className="w-3 h-3 mr-1" />Stale
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Not updated in 7+ days</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {project.health_score ? (
                          <Badge variant="outline" className={healthScoreStyles[project.health_score] ?? ""}>{project.health_score}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => navigate(`/projects/${project.id}`)}><Eye className="w-4 h-4" /></Button>
                            </TooltipTrigger>
                            <TooltipContent>View Project</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleRescan(project.name)}>
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Re-scan</TooltipContent>
                          </Tooltip>
                          <AlertDialog>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Project</AlertDialogTitle>
                                <AlertDialogDescription>Are you sure you want to delete "{project.name}"? This action cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(project.id, project.name)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        projectName={newProjectName}
        onProjectNameChange={setNewProjectName}
        projectLanguage={newProjectLanguage}
        onProjectLanguageChange={setNewProjectLanguage}
        projectType={newProjectType}
        onProjectTypeChange={setNewProjectType}
        teamId={newProjectTeamId}
        onTeamIdChange={setNewProjectTeamId}
        userTeams={userTeams}
        hasTeams={hasTeams}
        canCreate={canCreateProject}
        isCreating={isCreating}
        onCreate={handleCreateProject}
      />
    </DashboardLayout>
  );
};

// ── Create Project Modal ──────────────────────────────────────────────

interface CreateProjectModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onProjectNameChange: (v: string) => void;
  projectLanguage: "C" | "C++" | "";
  onProjectLanguageChange: (v: "C" | "C++" | "") => void;
  projectType: "personal" | "team";
  onProjectTypeChange: (v: "personal" | "team") => void;
  teamId: string;
  onTeamIdChange: (v: string) => void;
  userTeams: Team[];
  hasTeams: boolean;
  canCreate: boolean;
  isCreating: boolean;
  onCreate: () => void;
}

const CreateProjectModal = ({
  isOpen, onOpenChange, projectName, onProjectNameChange,
  projectLanguage, onProjectLanguageChange,
  projectType, onProjectTypeChange, teamId, onTeamIdChange,
  userTeams, hasTeams, canCreate, isCreating, onCreate,
}: CreateProjectModalProps) => {
  const navigate = useNavigate();

  // Only teams where the current user is an admin can have projects created under them.
  const adminTeams = userTeams.filter((t) => t.current_user_role === "admin");
  const hasAdminTeams = adminTeams.length > 0;

  // When the user switches to "team" type, if their previously selected team is
  // no longer in the admin list, clear the selection.
  const isSelectedTeamValid = adminTeams.some((t) => t.id === teamId);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>Set up a new project to start scanning your code.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              placeholder="e.g. auth-service, payment-module"
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              className="bg-card/50 border-border/50 focus:border-primary/50"
            />
            {projectName.trim() !== "" && !/^[a-zA-Z]/.test(projectName.trim()) && (
              <p className="text-xs text-destructive">Project name must start with a letter.</p>
            )}
          </div>

          {/* Language */}
          <div className="space-y-2">
            <Label>Language</Label>
            <div className="grid grid-cols-2 gap-3">
              {(["C", "C++"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => onProjectLanguageChange(lang)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${
                    projectLanguage === lang
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 bg-card/30 text-muted-foreground hover:border-border"
                  }`}
                >
                  <span className="text-lg font-mono font-bold">{lang}</span>
                  <span className="text-xs">{lang === "C" ? "C Language" : "C++ Language"}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Project Type Cards */}
          <div className="space-y-2">
            <Label>Project Type</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onProjectTypeChange("personal")}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${
                  projectType === "personal"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 bg-card/30 text-muted-foreground hover:border-border"
                }`}
              >
                <User className="w-6 h-6" />
                <span className="text-sm font-medium">Personal</span>
              </button>
              <button
                type="button"
                onClick={() => onProjectTypeChange("team")}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${
                  projectType === "team"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 bg-card/30 text-muted-foreground hover:border-border"
                }`}
              >
                <Users className="w-6 h-6" />
                <span className="text-sm font-medium">Team</span>
              </button>
            </div>
          </div>

          {/* Team Selector — only shown when "Team" type is selected */}
          {projectType === "team" && (
            <>
              {/* Case 1: User has no teams at all */}
              {!hasTeams && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border/50">
                  <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">You're not part of any team yet.</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Create a team first — you'll automatically become its admin and can create projects under it.
                    </p>
                    <button
                      type="button"
                      onClick={() => { onOpenChange(false); navigate("/teams"); }}
                      className="text-sm text-primary hover:underline mt-2 inline-flex items-center gap-1 font-medium"
                    >
                      Create a new team →
                    </button>
                  </div>
                </div>
              )}

              {/* Case 2: User has teams but is not admin in any of them */}
              {hasTeams && !hasAdminTeams && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <Crown className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Admin access required</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Only team admins can create projects under a team. You're currently a{" "}
                      <span className="font-medium text-foreground">
                        {userTeams[0]?.current_user_role}
                      </span>{" "}
                      in your team(s).
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      You can either ask a team admin to create this project, or create your own team where you'll be the admin.
                    </p>
                    <button
                      type="button"
                      onClick={() => { onOpenChange(false); navigate("/teams"); }}
                      className="text-sm text-primary hover:underline mt-2 inline-flex items-center gap-1 font-medium"
                    >
                      Create a new team →
                    </button>
                  </div>
                </div>
              )}

              {/* Case 3: User is admin in at least one team — show only those teams */}
              {hasAdminTeams && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Select Team</Label>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Crown className="h-3 w-3 text-yellow-500" />
                      Admin teams only
                    </span>
                  </div>
                  <Select
                    value={isSelectedTeamValid ? teamId : ""}
                    onValueChange={onTeamIdChange}
                  >
                    <SelectTrigger className="bg-card/50 border-border/50">
                      <SelectValue placeholder="Choose a team" />
                    </SelectTrigger>
                    <SelectContent>
                      {adminTeams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          <span className="flex items-center gap-2">
                            <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                            <span className="truncate">{team.name}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 h-4 capitalize ${roleBadgeStyles["admin"]}`}
                            >
                              admin
                            </Badge>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hasTeams && adminTeams.length < userTeams.length && (
                    <p className="text-xs text-muted-foreground">
                      {userTeams.length - adminTeams.length} team(s) hidden — you need admin access to create projects there.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onCreate}
            disabled={!canCreate || isCreating || (projectType === "team" && !hasAdminTeams)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isCreating ? "Creating…" : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Projects;
