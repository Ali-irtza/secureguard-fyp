import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search, FolderOpen, Eye, RotateCcw, Trash2, Plus, 
  ChevronUp, ChevronDown, Clock, AlertTriangle,
  Shield, ShieldAlert, ShieldCheck, ShieldX,
  User, Users, Crown, Github, Info
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { mockTeams, CURRENT_USER_ID, type TeamRole } from "@/lib/team-data";

interface Project {
  id: string;
  name: string;
  language: "Python" | "C" | "C++";
  lastScan: string;
  healthScore: "A" | "B" | "C" | "D" | "F";
  type: "personal" | "team";
  teamId?: string;
  teamName?: string;
  hasGithubRepo?: boolean;
}

type SortField = "name" | "language" | "lastScan" | "healthScore";
type SortDirection = "asc" | "desc";

const mockProjects: Project[] = [
  { id: "1", name: "api-gateway", language: "Python", lastScan: "2024-12-08", healthScore: "A", type: "personal" },
  { id: "2", name: "auth-service", language: "C++", lastScan: "2024-12-07", healthScore: "B", type: "team", teamId: "team-1", teamName: "SecureGuard Team", hasGithubRepo: true },
  { id: "3", name: "payment-module", language: "Python", lastScan: "2024-12-05", healthScore: "C", type: "team", teamId: "team-1", teamName: "SecureGuard Team", hasGithubRepo: true },
  { id: "4", name: "data-processor", language: "C", lastScan: "2024-12-04", healthScore: "A", type: "personal" },
  { id: "5", name: "ml-pipeline", language: "Python", lastScan: "2024-12-03", healthScore: "D", type: "personal" },
  { id: "6", name: "embedded-firmware", language: "C", lastScan: "2024-12-01", healthScore: "B", type: "team", teamId: "team-2", teamName: "Ali's Project", hasGithubRepo: true },
  { id: "7", name: "crypto-lib", language: "C++", lastScan: "2024-11-28", healthScore: "F", type: "personal" },
  { id: "8", name: "web-scraper", language: "Python", lastScan: "2024-11-25", healthScore: "A", type: "personal" },
];

const languageBadgeStyles: Record<string, string> = {
  Python: "bg-blue-500/20 text-blue-400 border-blue-500/30",
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
  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [projectTypeFilter, setProjectTypeFilter] = useState<"all" | "personal" | "team">("all");
  const [projects, setProjects] = useState<Project[]>(mockProjects);
  const [sortField, setSortField] = useState<SortField>("lastScan");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectType, setNewProjectType] = useState<"personal" | "team">("personal");
  const [newProjectTeamId, setNewProjectTeamId] = useState("");

  // Team data
  const userTeams = mockTeams.filter((t) =>
    t.members.some((m) => m.id === CURRENT_USER_ID)
  );
  const hasTeams = userTeams.length > 0;

  // Calculate days since last scan
  const getDaysSinceLastScan = (dateString: string): number => {
    const scanDate = new Date(dateString);
    const today = new Date();
    const diffTime = today.getTime() - scanDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  // Get stale status
  const getStaleStatus = (dateString: string): "fresh" | "stale" | "critical" => {
    const days = getDaysSinceLastScan(dateString);
    if (days >= 14) return "critical";
    if (days >= 7) return "stale";
    return "fresh";
  };

  // Stats calculation
  const stats = useMemo(() => {
    const healthy = projects.filter(p => p.healthScore === "A" || p.healthScore === "B").length;
    const needsAttention = projects.filter(p => p.healthScore === "C" || p.healthScore === "D").length;
    const critical = projects.filter(p => p.healthScore === "F").length;
    return { total: projects.length, healthy, needsAttention, critical };
  }, [projects]);

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    let result = projects.filter((project) => {
      const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLanguage = languageFilter === "all" || project.language === languageFilter;
      const matchesHealth = healthFilter === "all" || 
        (healthFilter === "healthy" && (project.healthScore === "A" || project.healthScore === "B")) ||
        (healthFilter === "attention" && (project.healthScore === "C" || project.healthScore === "D")) ||
        (healthFilter === "critical" && project.healthScore === "F");
      const matchesType = projectTypeFilter === "all" || project.type === projectTypeFilter;
      return matchesSearch && matchesLanguage && matchesHealth && matchesType;
    });

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "language":
          comparison = a.language.localeCompare(b.language);
          break;
        case "lastScan":
          comparison = new Date(a.lastScan).getTime() - new Date(b.lastScan).getTime();
          break;
        case "healthScore":
          comparison = healthScoreOrder[a.healthScore] - healthScoreOrder[b.healthScore];
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [projects, searchQuery, languageFilter, healthFilter, projectTypeFilter, sortField, sortDirection]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleDelete = (projectId: string, projectName: string) => {
    setProjects(projects.filter((p) => p.id !== projectId));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });
    toast({
      title: "Project Deleted",
      description: `"${projectName}" has been removed.`,
    });
  };

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    setProjects(projects.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    toast({
      title: "Projects Deleted",
      description: `${count} project(s) have been removed.`,
    });
  };

  const handleRescan = (projectName: string) => {
    navigate(`/new-scan?project=${encodeURIComponent(projectName)}`);
  };

  const handleBulkRescan = () => {
    const count = selectedIds.size;
    toast({
      title: "Bulk Re-scan Initiated",
      description: `Starting scans for ${count} project(s)...`,
    });
    setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProjects.map(p => p.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreateProject = () => {
    const selectedTeam = userTeams.find((t) => t.id === newProjectTeamId);
    const newProject: Project = {
      id: `proj-${Date.now()}`,
      name: newProjectName.trim(),
      language: "Python",
      lastScan: new Date().toISOString().split("T")[0],
      healthScore: "A",
      type: newProjectType,
      teamId: newProjectType === "team" ? newProjectTeamId : undefined,
      teamName: newProjectType === "team" ? selectedTeam?.name : undefined,
      hasGithubRepo: newProjectType === "team" ? !!selectedTeam?.githubRepo : false,
    };
    setProjects((prev) => [newProject, ...prev]);
    setIsCreateOpen(false);
    setNewProjectName("");
    setNewProjectType("personal");
    setNewProjectTeamId("");
    toast({
      title: "Project Created",
      description: `"${newProject.name}" has been created.`,
    });
  };

  const canCreateProject =
    newProjectName.trim() !== "" &&
    (newProjectType === "personal" || (newProjectType === "team" && newProjectTeamId !== ""));

  const getEmptyStateMessage = () => {
    if (projectTypeFilter === "team") {
      return "No team projects found. Create a project and assign it to a team.";
    }
    if (projectTypeFilter === "personal") {
      return "No personal projects found.";
    }
    return null;
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="w-4 h-4 opacity-30" />;
    return sortDirection === "asc" 
      ? <ChevronUp className="w-4 h-4 text-primary" /> 
      : <ChevronDown className="w-4 h-4 text-primary" />;
  };

  // Full empty state — no projects at all
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

        {/* Create Project Modal — also available from empty state */}
        <CreateProjectModal
          isOpen={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          projectName={newProjectName}
          onProjectNameChange={setNewProjectName}
          projectType={newProjectType}
          onProjectTypeChange={setNewProjectType}
          teamId={newProjectTeamId}
          onTeamIdChange={setNewProjectTeamId}
          userTeams={userTeams}
          hasTeams={hasTeams}
          canCreate={canCreateProject}
          onCreate={handleCreateProject}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Projects</h1>
            <p className="text-muted-foreground mt-1">Manage and monitor your code repositories</p>
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
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Projects</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-card/50 border-border/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <ShieldCheck className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">{stats.healthy}</p>
                <p className="text-sm text-muted-foreground">Healthy (A-B)</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-card/50 border-border/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <ShieldAlert className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-400">{stats.needsAttention}</p>
                <p className="text-sm text-muted-foreground">Needs Attention</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-card/50 border-border/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <ShieldX className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{stats.critical}</p>
                <p className="text-sm text-muted-foreground">Critical (F)</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card/50 border-border/50 focus:border-primary/50"
            />
          </div>
          <Select value={languageFilter} onValueChange={setLanguageFilter}>
            <SelectTrigger className="w-full sm:w-48 bg-card/50 border-border/50">
              <SelectValue placeholder="Filter by Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Languages</SelectItem>
              <SelectItem value="Python">Python</SelectItem>
              <SelectItem value="C">C</SelectItem>
              <SelectItem value="C++">C++</SelectItem>
            </SelectContent>
          </Select>
          <Select value={healthFilter} onValueChange={setHealthFilter}>
            <SelectTrigger className="w-full sm:w-48 bg-card/50 border-border/50">
              <SelectValue placeholder="Filter by Health" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scores</SelectItem>
              <SelectItem value="healthy">Healthy (A-B)</SelectItem>
              <SelectItem value="attention">Needs Attention (C-D)</SelectItem>
              <SelectItem value="critical">Critical (F)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={projectTypeFilter} onValueChange={(v) => setProjectTypeFilter(v as "all" | "personal" | "team")}>
            <SelectTrigger className="w-full sm:w-48 bg-card/50 border-border/50">
              <SelectValue placeholder="Filter by Type" />
            </SelectTrigger>
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
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} project(s) selected
            </span>
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkRescan}
                className="border-border/50"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Re-scan Selected
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/50 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedIds.size} Project(s)</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {selectedIds.size} selected project(s)? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleBulkDelete}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      Delete All
                    </AlertDialogAction>
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
                  <Checkbox
                    checked={filteredProjects.length > 0 && selectedIds.size === filteredProjects.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead 
                  className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    Project Name
                    <SortIcon field="name" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort("language")}
                >
                  <div className="flex items-center gap-1">
                    Language
                    <SortIcon field="language" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort("lastScan")}
                >
                  <div className="flex items-center gap-1">
                    Last Scan
                    <SortIcon field="lastScan" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => handleSort("healthScore")}
                >
                  <div className="flex items-center gap-1">
                    Health Score
                    <SortIcon field="healthScore" />
                  </div>
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
                      <p className="text-muted-foreground">
                        {getEmptyStateMessage() || "No projects found"}
                      </p>
                      {!getEmptyStateMessage() && (
                        <p className="text-sm text-muted-foreground/70">Try adjusting your search or filters</p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProjects.map((project) => {
                  const staleStatus = getStaleStatus(project.lastScan);
                  return (
                    <TableRow key={project.id} className="border-border/30 hover:bg-muted/10">
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(project.id)}
                          onCheckedChange={() => toggleSelect(project.id)}
                          aria-label={`Select ${project.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <FolderOpen className="w-4 h-4 text-primary flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{project.name}</span>
                              {project.type === "team" && (
                                <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0 h-4">
                                  Team
                                </Badge>
                              )}
                              {project.hasGithubRepo && (
                                <Github className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </div>
                            {project.type === "team" && project.teamName && (
                              <p className="text-xs text-muted-foreground mt-0.5">{project.teamName}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={languageBadgeStyles[project.language]}>
                          {project.language}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {formatDate(project.lastScan)}
                          </span>
                          {staleStatus === "stale" && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                                  <Clock className="w-3 h-3 mr-1" />
                                  Stale
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Not scanned in 7+ days</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={healthScoreStyles[project.healthScore]}>
                          {project.healthScore}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                <Eye className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View Report</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => handleRescan(project.name)}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Re-scan</TooltipContent>
                          </Tooltip>

                          <AlertDialog>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Project</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{project.name}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(project.id, project.name)}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
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
        projectType={newProjectType}
        onProjectTypeChange={setNewProjectType}
        teamId={newProjectTeamId}
        onTeamIdChange={setNewProjectTeamId}
        userTeams={userTeams}
        hasTeams={hasTeams}
        canCreate={canCreateProject}
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
  projectType: "personal" | "team";
  onProjectTypeChange: (v: "personal" | "team") => void;
  teamId: string;
  onTeamIdChange: (v: string) => void;
  userTeams: typeof mockTeams;
  hasTeams: boolean;
  canCreate: boolean;
  onCreate: () => void;
}

const CreateProjectModal = ({
  isOpen,
  onOpenChange,
  projectName,
  onProjectNameChange,
  projectType,
  onProjectTypeChange,
  teamId,
  onTeamIdChange,
  userTeams,
  hasTeams,
  canCreate,
  onCreate,
}: CreateProjectModalProps) => {
  const navigate = useNavigate();

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

          {/* Team Selector — only when Team type is selected */}
          {projectType === "team" && (
            hasTeams ? (
              <div className="space-y-2">
                <Label>Select Team</Label>
                <Select value={teamId} onValueChange={onTeamIdChange}>
                  <SelectTrigger className="bg-card/50 border-border/50">
                    <SelectValue placeholder="Choose a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {userTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        <span className="flex items-center gap-2">
                          {team.currentUserRole === "admin" && (
                            <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                          )}
                          <span className="truncate">{team.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 h-4 capitalize ${roleBadgeStyles[team.currentUserRole]}`}
                          >
                            {team.currentUserRole}
                          </Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border/50">
                <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">You are not part of any team yet.</p>
                  <button
                    type="button"
                    onClick={() => { onOpenChange(false); navigate("/teams"); }}
                    className="text-sm text-primary hover:underline mt-1 inline-flex items-center gap-1"
                  >
                    Go to Teams page →
                  </button>
                </div>
              </div>
            )
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onCreate}
            disabled={!canCreate}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Projects;
