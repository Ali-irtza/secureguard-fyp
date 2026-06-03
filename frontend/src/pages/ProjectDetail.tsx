import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Upload, Trash2, Download, FileCode, FileCode2,
  AlertTriangle, FolderOpen, Plus, X, CheckCircle2, Loader2,
  Shield, ShieldCheck, ShieldAlert, ShieldX, Clock, RefreshCw,
  Github, GitBranch, ChevronDown, ChevronRight, Eye, Maximize2, User,
  ExternalLink,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useGithubOAuthCallback } from "@/hooks/use-github-oauth-callback";
import {
  listProjectFiles, uploadProjectFile, deleteProjectFile, importGithubFile,
  getAcceptString, isFileAllowed,
  type ProjectFile, type FileSource,
} from "@/lib/project-files-api";
import {
  type Project,
  updateProject,
  getProjectGithubAuthorizeUrl,
  listProjectGithubRepos,
  selectProjectGithubRepo,
  syncProjectGithubBranches,
  fetchProjectBranchFiles,
} from "@/lib/projects-api";
import {
  apiFetch, listTeams, fetchBranchFiles,
  type Team, type TeamRole, type BranchFileItem,
} from "@/lib/teams-api";

// ---------------------------------------------------------------------------
// Display constants & pure helpers
// ---------------------------------------------------------------------------

const HEALTH_STYLES: Record<string, string> = {
  A: "bg-green-500/20 text-green-400 border-green-500/30",
  B: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  C: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  D: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  F: "bg-red-500/20 text-red-400 border-red-500/30",
};

const LANG_BADGE: Record<string, string> = {
  C:     "bg-gray-500/20 text-gray-400 border-gray-500/30",
  "C++": "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

const SOURCE_BADGE: Record<FileSource, string> = {
  local:  "bg-muted/50 text-muted-foreground border-border/50",
  github: "bg-violet-500/20 text-violet-400 border-violet-500/30",
};

const HealthIcon = ({ score }: { score: string | null }) => {
  if (!score)                          return <Shield      className="w-5 h-5 text-muted-foreground" />;
  if (score === "A" || score === "B")  return <ShieldCheck className="w-5 h-5 text-green-400" />;
  if (score === "C" || score === "D")  return <ShieldAlert className="w-5 h-5 text-yellow-400" />;
  return <ShieldX className="w-5 h-5 text-red-400" />;
};

const FileIcon = ({ filename }: { filename: string }) => {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return [".cpp", ".cxx", ".cc", ".hpp", ".hxx"].includes(ext)
    ? <FileCode2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
    : <FileCode  className="w-4 h-4 text-gray-400  flex-shrink-0" />;
};

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const k = 1024, s = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${parseFloat((n / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getLanguageFromExt(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    c: "c", h: "c", cpp: "cpp", cxx: "cpp", cc: "cpp", hpp: "cpp", hxx: "cpp",
  };
  return map[ext] ?? "text";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UploadItem {
  id:       string;
  file:     File;
  status:   "pending" | "uploading" | "done" | "error";
  progress: number;
  error?:   string;
}

interface TeamCtx {
  teamId:           string;
  teamName:         string;
  role:             TeamRole;
  assignedBranches: string[];  // empty = admin (unrestricted)
  githubRepo:       string | null;
  allBranches:      string[];
  members:          Array<{ user_id: string; full_name: string | null; email: string | null }>;
}

// ---------------------------------------------------------------------------
// ProjectGithubCard
// ---------------------------------------------------------------------------
// GitHub Repository settings card for PERSONAL projects (type === "personal").
// Uses the same GitHub App OAuth flow as Team.tsx — no manual PAT entry.
// Flow: Connect with GitHub → redirect → callback → repo picker → connected.
// Refresh Branches: uses stored installation token, no PAT needed.
// ---------------------------------------------------------------------------

interface ProjectGithubCardProps {
  project: Project;
  onProjectUpdated: (updated: Project) => void;
}

const ProjectGithubCard = ({ project, onProjectUpdated }: ProjectGithubCardProps) => {
  const { toast } = useToast();

  // ── State ─────────────────────────────────────────────────────────────────
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [repoPicker,    setRepoPicker]    = useState(false);
  const [githubRepos,   setGithubRepos]   = useState<{ full_name: string; private: boolean; url: string }[]>([]);
  const [reposLoading,  setReposLoading]  = useState(false);
  /** full_name of the repo currently being connected, or null when idle */
  const [connectingRepo, setConnectingRepo] = useState<string | null>(null);

  // ── OAuth: start GitHub App install flow ──────────────────────────────────
  const handleGithubOAuth = async () => {
    setActionLoading(true);
    try {
      const url = await getProjectGithubAuthorizeUrl(project.id);
      // actionLoading is intentionally not reset — the page unloads immediately.
      window.location.href = url;
    } catch (err: any) {
      toast({ title: "GitHub error", description: err.message ?? "Failed to start GitHub authorization", variant: "destructive" });
      setActionLoading(false);
    }
  };

  // ── OAuth: load repos after callback ──────────────────────────────────────
  // Kept stable so the hook below can capture it in a ref without
  // stale-closure risk. State setters from useState are guaranteed stable.
  const handleOAuthCallback = useCallback(async () => {
    if (!project?.id) return;
    setReposLoading(true);
    try {
      const repos = await listProjectGithubRepos(project.id);
      if (repos.length === 1) {
        // Auto-connect when exactly one repo was installed.
        setActionLoading(true);
        try {
          const updated = await selectProjectGithubRepo(project.id, repos[0].full_name, repos[0].url);
          onProjectUpdated(updated);
          toast({ title: "Repository connected", description: `${repos[0].full_name} — ${updated.github_branches.length} branches synced` });
        } catch (err: any) {
          toast({ title: "Connect failed", description: err.message ?? "Failed to connect repository", variant: "destructive" });
        } finally {
          setActionLoading(false);
        }
      } else {
        setGithubRepos(repos);
        setRepoPicker(true);
      }
    } catch (err: any) {
      toast({ title: "GitHub error", description: err.message ?? "Failed to load repositories", variant: "destructive" });
    } finally {
      setReposLoading(false);
    }
  }, [project?.id, onProjectUpdated, toast]);

  // Detects ?github_connected / ?github_error on page load (runs once),
  // cleans the URL, guards against double-fire, and exposes `isConnecting`.
  const { isConnecting: githubCallbackConnecting } = useGithubOAuthCallback({
    onSuccess: handleOAuthCallback,
    onError:   (msg) => toast({ title: "GitHub connection failed", description: msg, variant: "destructive" }),
    // No paramKey — the project callback URL does not include a separate param.
  });

  const handleSelectRepo = async (repoFullName: string, repoUrl: string) => {
    if (connectingRepo) return;
    setConnectingRepo(repoFullName);
    try {
      const updated = await selectProjectGithubRepo(project.id, repoFullName, repoUrl);
      onProjectUpdated(updated);
      toast({ title: "Repository connected", description: `${repoFullName} — ${updated.github_branches.length} branches synced` });
      setRepoPicker(false);
      setGithubRepos([]);
    } catch (err: any) {
      toast({ title: "Connect failed", description: err.message ?? "Failed to connect repository", variant: "destructive" });
    } finally {
      setConnectingRepo(null);
    }
  };

  const handleRefreshBranches = async () => {
    setRefreshing(true);
    try {
      const updated = await syncProjectGithubBranches(project.id);
      onProjectUpdated(updated);
      toast({ title: "Branches refreshed", description: `${updated.github_branches.length} branches synced from GitHub` });
    } catch (err: any) {
      toast({ title: "Refresh failed", description: err.message ?? "Failed to sync branches", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    try {
      const updated = await updateProject(project.id, { github_repo: "" });
      onProjectUpdated({ ...updated, github_repo: null, github_branches: [] });
      toast({ title: "Repository disconnected" });
    } catch (err: any) {
      toast({ title: "Disconnect failed", description: err.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader><CardTitle>GitHub Repository</CardTitle></CardHeader>
        <CardContent>
          {/* Post-OAuth return banner — visible while repos are being fetched */}
          {githubCallbackConnecting && (
            <div className="flex items-center gap-3 p-3 mb-4 rounded-lg bg-primary/10 border border-primary/20 animate-in fade-in">
              <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Connecting your GitHub repository…</p>
                <p className="text-xs text-muted-foreground mt-0.5">Fetching your repositories from GitHub.</p>
              </div>
            </div>
          )}
          {project.github_repo ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Github className="h-5 w-5 text-foreground" />
                <a href={project.github_repo} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline text-sm flex items-center gap-1">
                  {project.github_repo.replace("https://github.com/", "")}
                  <ExternalLink className="h-3 w-3" />
                </a>
                <Badge className="bg-primary/15 text-primary border-primary/30 text-xs">Connected</Badge>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">{project.github_branches.length} branches synced</span>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-2">
                  {project.github_branches.map((b) => (
                    <Badge key={b} variant="secondary" className="text-[10px] font-normal bg-muted/50 hover:bg-muted/80">{b}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="gap-2" onClick={handleRefreshBranches} disabled={refreshing || actionLoading}>
                  {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh Branches
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={actionLoading || refreshing}
                      className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                      Disconnect
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect Repository</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove the GitHub connection from <span className="font-medium">{project.name}</span>.
                        Branch-based scanning will no longer be available until you reconnect.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDisconnect} className="bg-destructive hover:bg-destructive/90">Disconnect</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-border/50 rounded-lg p-8 flex flex-col items-center gap-4">
              <Github className="h-10 w-10 text-muted-foreground" />
              <div className="text-center space-y-1">
                <p className="font-medium">No repository connected</p>
                <p className="text-sm text-muted-foreground">Connect a GitHub repository to enable branch-based scanning for this project</p>
              </div>
              <Button onClick={handleGithubOAuth} disabled={actionLoading || githubCallbackConnecting} className="bg-primary hover:bg-primary/90 gap-2">
                {(actionLoading || githubCallbackConnecting) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                {githubCallbackConnecting ? "Connecting…" : "Connect with GitHub"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repo Picker — shown after OAuth callback when multiple repos are available */}
      <Dialog
        open={repoPicker}
        onOpenChange={(open) => {
          // Prevent closing while a connection is in progress
          if (!open && connectingRepo) return;
          if (!open) { setRepoPicker(false); setGithubRepos([]); }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select a Repository</DialogTitle>
            <DialogDescription>Choose which repository to connect to <span className="font-medium">{project.name}</span></DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {reposLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : githubRepos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No repositories found.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
                {githubRepos.map((repo) => {
                  const isThisConnecting  = connectingRepo === repo.full_name;
                  const isAnyConnecting   = connectingRepo !== null;
                  const isOtherConnecting = isAnyConnecting && !isThisConnecting;

                  return (
                    <button
                      key={repo.full_name}
                      onClick={() => handleSelectRepo(repo.full_name, repo.url)}
                      disabled={isAnyConnecting}
                      className={[
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-150 text-left",
                        isThisConnecting
                          ? "bg-primary/10 border border-primary/30 cursor-wait"
                          : isOtherConnecting
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-muted/50 cursor-pointer group",
                      ].join(" ")}
                    >
                      {/* Left: icon + name */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isThisConnecting ? (
                          <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                        ) : (
                          <Github className={[
                            "h-4 w-4 shrink-0 transition-colors",
                            isOtherConnecting ? "text-muted-foreground/50" : "text-muted-foreground",
                          ].join(" ")} />
                        )}
                        <span className={[
                          "text-sm font-medium truncate",
                          isThisConnecting  ? "text-primary" : "",
                          isOtherConnecting ? "text-muted-foreground/50" : "",
                        ].join(" ")}>
                          {repo.full_name}
                        </span>
                      </div>

                      {/* Right: badges + status label */}
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {repo.private && (
                          <Badge
                            variant="outline"
                            className={[
                              "text-[10px] px-1.5 py-0 h-4",
                              isOtherConnecting ? "opacity-40" : "",
                            ].join(" ")}
                          >
                            Private
                          </Badge>
                        )}
                        {isThisConnecting ? (
                          <span className="text-xs text-primary font-medium">Connecting…</span>
                        ) : (
                          <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">Connect →</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={!!connectingRepo}
              onClick={() => { setRepoPicker(false); setGithubRepos([]); }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ---------------------------------------------------------------------------
// GitHubImportPanel
// ---------------------------------------------------------------------------
// Self-contained panel: branch selector → file tree → import button.
// Only rendered when the project is a team project with a connected repo
// and the current user is admin or developer.
// ---------------------------------------------------------------------------

interface GitHubImportPanelProps {
  projectId: string;
  language:  string | null;
  ctx:       TeamCtx;
  onImported: (file: ProjectFile) => void;
}

const GitHubImportPanel = ({ projectId, language, ctx, onImported }: GitHubImportPanelProps) => {
  const { toast } = useToast();

  const availableBranches = ctx.role === "admin" ? ctx.allBranches : ctx.assignedBranches;

  const [branch,       setBranch]       = useState<string>(availableBranches[0] ?? "");
  const [tree,         setTree]         = useState<BranchFileItem[]>([]);
  const [loadingTree,  setLoadingTree]  = useState(false);
  const [treeError,    setTreeError]    = useState<string | null>(null);
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());
  const [importing,    setImporting]    = useState<Set<string>>(new Set());

  // Fetch file tree when branch changes
  const loadTree = useCallback(async (b: string) => {
    if (!b) return;
    setLoadingTree(true);
    setTreeError(null);
    setTree([]);
    setExpanded(new Set());
    try {
      const res = await fetchBranchFiles(ctx.teamId, b);
      setTree(res.files);
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoadingTree(false);
    }
  }, [ctx.teamId]);

  useEffect(() => { if (branch) loadTree(branch); }, [branch, loadTree]);

  const toggleDir = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const handleImport = async (filePath: string) => {
    if (!isFileAllowed(filePath, language)) {
      toast({
        title: "File type not allowed",
        description: `Only ${getAcceptString(language)} files are accepted for ${language} projects.`,
        variant: "destructive",
      });
      return;
    }
    setImporting((prev) => new Set(prev).add(filePath));
    try {
      const result = await importGithubFile(projectId, { branch, file_path: filePath });
      onImported(result);
      toast({ title: "File imported", description: `"${result.name}" imported from ${branch}.` });
    } catch (err) {
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setImporting((prev) => { const n = new Set(prev); n.delete(filePath); return n; });
    }
  };

  // Build a simple nested tree renderer
  const renderTree = (items: BranchFileItem[], prefix = "") => {
    const children = items.filter(
      (i) => i.path.startsWith(prefix) &&
             i.path.slice(prefix.length).split("/").filter(Boolean).length === 1
    );
    return children.map((item) => {
      const isDir  = item.type === "directory";
      const isOpen = expanded.has(item.path);
      const name   = item.path.split("/").pop() ?? item.path;
      const allowed = !isDir && isFileAllowed(item.path, language);

      return (
        <div key={item.path}>
          <div
            className={`flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors
              ${isDir ? "cursor-pointer hover:bg-muted/20" : allowed ? "hover:bg-muted/20" : "opacity-40"}
            `}
            onClick={() => isDir && toggleDir(item.path)}
          >
            {isDir
              ? (isOpen
                  ? <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />)
              : <FileIcon filename={name} />
            }
            <span className={`flex-1 truncate ${isDir ? "text-muted-foreground" : "text-foreground"}`}>
              {name}
            </span>
            {!isDir && allowed && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 flex-shrink-0"
                disabled={importing.has(item.path)}
                onClick={(e) => { e.stopPropagation(); handleImport(item.path); }}
              >
                {importing.has(item.path)
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : "Import"
                }
              </Button>
            )}
          </div>
          {isDir && isOpen && (
            <div className="ml-4 border-l border-border/30 pl-2">
              {renderTree(items, item.path + "/")}
            </div>
          )}
        </div>
      );
    });
  };

  if (!ctx.githubRepo) return null;

  return (
    <Card className="bg-card/50 border-border/50">
      {/* Header */}
      <div className="p-4 border-b border-border/30 rounded-t-xl flex items-center gap-3">
        <Github className="w-5 h-5 text-violet-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Import from GitHub</p>
          <p className="text-xs text-muted-foreground truncate">{ctx.githubRepo}</p>
        </div>
        <Badge variant="outline" className="text-xs capitalize bg-muted/30 text-muted-foreground border-border/50 flex-shrink-0">
          {ctx.role}
        </Badge>
      </div>

      <div className="p-4 space-y-3">
        {/* No branches available for developer */}
        {availableBranches.length === 0 ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              No branches assigned to you. Ask your team admin to assign branches.
            </p>
          </div>
        ) : (
          <>
            {/* Branch selector */}
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger className="flex-1 bg-card/50 border-border/50 h-8 text-sm">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {availableBranches.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 border-border/50 flex-shrink-0"
                    onClick={() => loadTree(branch)} disabled={loadingTree}>
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingTree ? "animate-spin" : ""}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Refresh file tree</TooltipContent>
              </Tooltip>
            </div>

            {/* File tree */}
            {loadingTree && (
              <div className="space-y-1.5 pt-1">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            )}
            {treeError && (
              <p className="text-xs text-destructive px-1">{treeError}</p>
            )}
            {!loadingTree && !treeError && tree.length === 0 && branch && (
              <p className="text-xs text-muted-foreground text-center py-3">No files found on this branch</p>
            )}
            {!loadingTree && tree.length > 0 && (
              <div className="max-h-72 overflow-y-auto rounded-lg bg-card/30 border border-border/30 p-2">
                <p className="text-xs text-muted-foreground px-2 pb-2">
                  Only {getAcceptString(language)} files can be imported
                </p>
                {renderTree(tree)}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// PersonalGitHubImportPanel
// ---------------------------------------------------------------------------
// File browser for PERSONAL projects with a connected GitHub repo.
// Uses the stored installation token (no PAT) — mirrors GitHubImportPanel
// for team projects exactly, but without role/branch restrictions.
// ---------------------------------------------------------------------------

interface PersonalGitHubImportPanelProps {
  projectId:  string;
  language:   string | null;
  githubRepo: string;
  branches:   string[];
  onImported: (file: ProjectFile) => void;
}

const PersonalGitHubImportPanel = ({
  projectId, language, githubRepo, branches, onImported,
}: PersonalGitHubImportPanelProps) => {
  const { toast } = useToast();

  const [branch,      setBranch]      = useState<string>(branches[0] ?? "");
  const [tree,        setTree]        = useState<BranchFileItem[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [treeError,   setTreeError]   = useState<string | null>(null);
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [importing,   setImporting]   = useState<Set<string>>(new Set());

  const loadTree = useCallback(async (b: string) => {
    if (!b) return;
    setLoadingTree(true);
    setTreeError(null);
    setTree([]);
    setExpanded(new Set());
    try {
      const res = await fetchProjectBranchFiles(projectId, b);
      setTree(res.files);
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoadingTree(false);
    }
  }, [projectId]);

  useEffect(() => { if (branch) loadTree(branch); }, [branch, loadTree]);

  const toggleDir = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const handleImport = async (filePath: string) => {
    if (!isFileAllowed(filePath, language)) {
      toast({
        title: "File type not allowed",
        description: `Only ${getAcceptString(language)} files are accepted for ${language} projects.`,
        variant: "destructive",
      });
      return;
    }
    setImporting((prev) => new Set(prev).add(filePath));
    try {
      const result = await importGithubFile(projectId, { branch, file_path: filePath });
      onImported(result);
      toast({ title: "File imported", description: `"${result.name}" imported from ${branch}.` });
    } catch (err) {
      toast({
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setImporting((prev) => { const n = new Set(prev); n.delete(filePath); return n; });
    }
  };

  const renderTree = (items: BranchFileItem[], prefix = "") => {
    const children = items.filter(
      (i) => i.path.startsWith(prefix) &&
             i.path.slice(prefix.length).split("/").filter(Boolean).length === 1
    );
    return children.map((item) => {
      const isDir   = item.type === "directory";
      const isOpen  = expanded.has(item.path);
      const name    = item.path.split("/").pop() ?? item.path;
      const allowed = !isDir && isFileAllowed(item.path, language);
      return (
        <div key={item.path}>
          <div
            className={`flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors
              ${isDir ? "cursor-pointer hover:bg-muted/20" : allowed ? "hover:bg-muted/20" : "opacity-40"}`}
            onClick={() => isDir && toggleDir(item.path)}
          >
            {isDir
              ? (isOpen
                  ? <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />)
              : <FileIcon filename={name} />
            }
            <span className={`flex-1 truncate ${isDir ? "text-muted-foreground" : "text-foreground"}`}>
              {name}
            </span>
            {!isDir && allowed && (
              <Button
                size="sm" variant="ghost"
                className="h-6 px-2 text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 flex-shrink-0"
                disabled={importing.has(item.path)}
                onClick={(e) => { e.stopPropagation(); handleImport(item.path); }}
              >
                {importing.has(item.path) ? <Loader2 className="w-3 h-3 animate-spin" /> : "Import"}
              </Button>
            )}
          </div>
          {isDir && isOpen && (
            <div className="ml-4 border-l border-border/30 pl-2">
              {renderTree(items, item.path + "/")}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <Card className="bg-card/50 border-border/50">
      {/* Header */}
      <div className="p-4 border-b border-border/30 rounded-t-xl flex items-center gap-3">
        <Github className="w-5 h-5 text-violet-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Import from GitHub</p>
          <p className="text-xs text-muted-foreground truncate">{githubRepo}</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {branches.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No branches found. Try refreshing the repository from the GitHub Repository card above.
          </p>
        ) : (
          <>
            {/* Branch selector + refresh */}
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger className="flex-1 bg-card/50 border-border/50 h-8 text-sm">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 border-border/50 flex-shrink-0"
                    onClick={() => loadTree(branch)} disabled={loadingTree}>
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingTree ? "animate-spin" : ""}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Refresh file tree</TooltipContent>
              </Tooltip>
            </div>

            {/* File tree */}
            {loadingTree && (
              <div className="space-y-1.5 pt-1">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            )}
            {treeError && <p className="text-xs text-destructive px-1">{treeError}</p>}
            {!loadingTree && !treeError && tree.length === 0 && branch && (
              <p className="text-xs text-muted-foreground text-center py-3">No files found on this branch</p>
            )}
            {!loadingTree && tree.length > 0 && (
              <div className="max-h-72 overflow-y-auto rounded-lg bg-card/30 border border-border/30 p-2">
                <p className="text-xs text-muted-foreground px-2 pb-2">
                  Only {getAcceptString(language)} files can be imported
                </p>
                {renderTree(tree)}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// ProjectDetail — main page component
// ---------------------------------------------------------------------------

const ProjectDetail = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, displayName: currentUserDisplayName } = useCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Core state ───────────────────────────────────────────────────────
  const [project,          setProject]          = useState<Project | null>(null);
  const [files,            setFiles]            = useState<ProjectFile[]>([]);
  const [teamCtx,          setTeamCtx]          = useState<TeamCtx | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [isLoadingFiles,   setIsLoadingFiles]   = useState(true);
  const [projectError,     setProjectError]     = useState<string | null>(null);
  const [filesError,       setFilesError]       = useState<string | null>(null);

  // ── Upload queue ─────────────────────────────────────────────────────
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [isDragging,  setIsDragging]  = useState(false);

  // ── File preview ─────────────────────────────────────────────────────
  const [previewFile,      setPreviewFile]      = useState<ProjectFile | null>(null);
  const [previewContent,   setPreviewContent]   = useState<string | null>(null);
  const [previewLoading,   setPreviewLoading]   = useState(false);
  const [previewExpanded,  setPreviewExpanded]  = useState(false);

  // ── Load project ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    setIsLoadingProject(true);
    apiFetch<Project>(`/projects/${projectId}`)
      .then(async (p) => {
        setProject(p);
        // If team project, resolve team context (role, branches, github)
        if (p.type === "team" && p.team_id) {
          try {
            const { supabase } = await import("@/lib/supabase");
            const { data: { session } } = await supabase.auth.getSession();
            const currentUserId = session?.user?.id;

            const teams = await listTeams();
            const team  = teams.find((t: Team) => t.id === p.team_id);
            if (team && currentUserId) {
              const role = team.current_user_role;
              // Find the current user's own member row to read their assigned branches
              const myMemberRow      = team.members.find((m) => m.user_id === currentUserId);
              const assignedBranches = (role === "developer" && myMemberRow?.branches) ? myMemberRow.branches : [];
              setTeamCtx({
                teamId:           team.id,
                teamName:         team.name,
                role,
                assignedBranches,
                githubRepo:       team.github_repo,
                allBranches:      team.github_branches ?? [],
                members:          team.members.map((m) => ({
                  user_id:   m.user_id,
                  full_name: m.profile.full_name,
                  email:     m.profile.email,
                })),
              });
            }
          } catch { /* non-fatal — GitHub section just won't show */ }
        }
        setIsLoadingProject(false);
      })
      .catch((err) => {
        setProjectError(err instanceof Error ? err.message : "Failed to load project");
        setIsLoadingProject(false);
      });
  }, [projectId]);

  // ── Load files ───────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!projectId) return;
    setIsLoadingFiles(true);
    setFilesError(null);
    try {
      setFiles(await listProjectFiles(projectId));
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setIsLoadingFiles(false);
    }
  }, [projectId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // ── GitHub update callback ───────────────────────────────────────────
  const handleProjectUpdated = useCallback((updated: Project) => {
    setProject(updated);
  }, []);

  // ── File validation & enqueue ────────────────────────────────────────
  const validateAndEnqueue = (rawFiles: FileList | File[]) => {
    if (!project?.language) return;
    const newItems: UploadItem[] = [];
    const rejectedType: string[]    = [];
    const rejectedSize: string[]    = [];
    const rejectedDup: string[]     = [];

    Array.from(rawFiles).forEach((f) => {
      if (f.size > 10 * 1024 * 1024) {
        rejectedSize.push(f.name);
      } else if (files.some(existing => existing.name === f.name) || uploadQueue.some(u => u.file.name === f.name)) {
        rejectedDup.push(f.name);
      } else if (!isFileAllowed(f.name, project.language)) {
        rejectedType.push(f.name);
      } else {
        newItems.push({ id: `${f.name}-${Date.now()}-${Math.random()}`, file: f, status: "pending", progress: 0 });
      }
    });

    if (rejectedSize.length > 0) {
      toast({
        title: "File too large",
        description: `${rejectedSize.join(", ")} exceed the 10 MB limit.`,
        variant: "destructive",
      });
    }

    if (rejectedDup.length > 0) {
      toast({
        title: "Duplicate file",
        description: `${rejectedDup.join(", ")} already exist in the project or upload queue.`,
        variant: "destructive",
      });
    }

    if (rejectedType.length > 0) {
      toast({
        title: "File type not allowed",
        description: `${rejectedType.join(", ")} — only ${getAcceptString(project.language)} files accepted.`,
        variant: "destructive",
      });
    }
    if (newItems.length > 0) setUploadQueue((prev) => [...prev, ...newItems]);
  };

  // ── Process upload queue (one at a time) ─────────────────────────────
  useEffect(() => {
    const pending = uploadQueue.find((i) => i.status === "pending");
    if (!pending || !projectId) return;

    setUploadQueue((prev) => prev.map((i) => i.id === pending.id ? { ...i, status: "uploading" } : i));

    uploadProjectFile(projectId, pending.file, (progress) =>
      setUploadQueue((prev) => prev.map((i) => i.id === pending.id ? { ...i, progress } : i))
    )
      .then((result) => {
        setUploadQueue((prev) => prev.map((i) => i.id === pending.id ? { ...i, status: "done", progress: 100 } : i));
        setFiles((prev) => {
          const exists = prev.some((f) => f.name === result.name);
          return exists ? prev.map((f) => f.name === result.name ? result : f) : [result, ...prev];
        });
        toast({ title: "File uploaded", description: `"${result.name}" added to project.` });
      })
      .catch((err) => {
        setUploadQueue((prev) => prev.map((i) =>
          i.id === pending.id ? { ...i, status: "error", error: err instanceof Error ? err.message : "Upload failed" } : i
        ));
        toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadQueue, projectId]);

  // ── Drag & drop ──────────────────────────────────────────────────────
  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop      = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); validateAndEnqueue(e.dataTransfer.files); };

  // ── Delete file ──────────────────────────────────────────────────────
  const handleDeleteFile = async (filename: string) => {
    if (!projectId) return;
    const snapshot = [...files];
    setFiles((prev) => prev.filter((f) => f.name !== filename));
    try {
      await deleteProjectFile(projectId, filename);
      toast({ title: "File deleted", description: `"${filename}" removed.` });
    } catch (err) {
      setFiles(snapshot);
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  // ── GitHub import callback ───────────────────────────────────────────
  const handleImported = (file: ProjectFile) => {
    setFiles((prev) => {
      const exists = prev.some((f) => f.name === file.name);
      return exists ? prev.map((f) => f.name === file.name ? file : f) : [file, ...prev];
    });
  };

  // ── File preview ─────────────────────────────────────────────────────
  const handlePreview = async (file: ProjectFile) => {
    setPreviewFile(file);
    setPreviewContent(null);
    setPreviewLoading(true);
    setPreviewExpanded(true);
    try {
      // Files are stored in Supabase Storage — fetch via the signed URL
      const res = await fetch(file.url);
      if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
      const text = await res.text();
      setPreviewContent(text);
    } catch (err) {
      setPreviewContent("[Could not load file content]");
    } finally {
      setPreviewLoading(false);
    }
  };

  const clearFinished = () =>
    setUploadQueue((prev) => prev.filter((i) => i.status === "uploading" || i.status === "pending"));

  // ── Loading / error guards ───────────────────────────────────────────
  if (isLoadingProject) {
    return (
      <DashboardLayout>
        <div className="space-y-6 max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (projectError || !project) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" onClick={() => navigate("/projects")} className="mb-4 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />Back to Projects
          </Button>
          <Card className="p-6 border-destructive/30 bg-destructive/5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">{projectError ?? "Project not found"}</p>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const acceptStr        = getAcceptString(project.language);
  const hasActiveUploads = uploadQueue.some((i) => i.status === "uploading" || i.status === "pending");
  const hasFinished      = uploadQueue.some((i) => i.status === "done" || i.status === "error");

  // Show GitHub panel only for team projects where user is admin or developer
  const showGithub = teamCtx && teamCtx.githubRepo && teamCtx.role !== "viewer";

  // Resolve a file's uploaded_by user ID to a display name.
  // Checks the current user first, then falls back to team member profiles
  // already loaded in teamCtx. Returns null if the name can't be resolved
  // (e.g. personal project with no team context).
  const resolveUploaderName = (uploadedBy: string | null): string | null => {
    if (!uploadedBy) return null;
    if (uploadedBy === user?.id) return currentUserDisplayName;
    if (teamCtx) {
      const member = teamCtx.members.find((m) => m.user_id === uploadedBy);
      if (member?.full_name) return member.full_name;
      if (member?.email) return member.email.split("@")[0];
    }
    return null;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">

        {/* Back nav */}
        <Button variant="ghost" onClick={() => navigate("/projects")} className="-ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />Back to Projects
        </Button>

        {/* Project header */}
        <Card className="p-6 bg-card/50 border-border/50 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-primary/10 flex-shrink-0">
                <FolderOpen className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {project.language && (
                    <Badge variant="outline" className={LANG_BADGE[project.language] ?? ""}>{project.language}</Badge>
                  )}
                  <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-border/50 capitalize">
                    {project.type}
                  </Badge>
                  {teamCtx && (
                    <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-border/50">
                      {teamCtx.teamName}
                    </Badge>
                  )}
                  {project.health_score ? (
                    <Badge variant="outline" className={HEALTH_STYLES[project.health_score] ?? ""}>
                      <HealthIcon score={project.health_score} />
                      <span className="ml-1">Health: {project.health_score}</span>
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-border/50">
                      <Shield className="w-3 h-3 mr-1" />Not scanned yet
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />Last updated {formatDate(project.updated_at)}
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate(`/new-scan?project=${encodeURIComponent(project.name)}`)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-glow-primary flex-shrink-0"
            >
              <Shield className="w-4 h-4 mr-2" />Run Scan
            </Button>
          </div>
        </Card>

        {/* GitHub repository card — personal projects only */}
        {project.type === "personal" && (
          <ProjectGithubCard
            project={project}
            onProjectUpdated={handleProjectUpdated}
          />
        )}

        {/* GitHub file browser — personal projects with a connected repo */}
        {project.type === "personal" && project.github_repo && (
          <PersonalGitHubImportPanel
            projectId={projectId!}
            language={project.language}
            githubRepo={project.github_repo}
            branches={project.github_branches}
            onImported={handleImported}
          />
        )}

        {/* GitHub import panel — team projects with connected repo, admin/developer only */}
        {showGithub && teamCtx && (
          <GitHubImportPanel
            projectId={projectId!}
            language={project.language}
            ctx={teamCtx}
            onImported={handleImported}
          />
        )}

        {/* Source files section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Source Files</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {project.language ? `Only ${acceptStr} files are accepted` : "No language set"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={loadFiles} disabled={isLoadingFiles} className="border-border/50">
                    <RefreshCw className={`w-4 h-4 ${isLoadingFiles ? "animate-spin" : ""}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Refresh</TooltipContent>
              </Tooltip>
              <Button onClick={() => fileInputRef.current?.click()} disabled={!project.language}
                className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="w-4 h-4 mr-2" />Upload Files
              </Button>
            </div>
          </div>

          {/* Hidden file input */}
          <input ref={fileInputRef} type="file" multiple accept={acceptStr} className="hidden"
            onChange={(e) => { if (e.target.files) { validateAndEnqueue(e.target.files); e.target.value = ""; } }}
          />

          {/* Drag & drop zone */}
          <div
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer
              flex flex-col items-center justify-center gap-3 py-10 px-6
              ${isDragging ? "border-primary bg-primary/10 scale-[1.01]" : "border-border/50 bg-card/20 hover:border-primary/40 hover:bg-card/40"}
              ${!project.language ? "opacity-50 pointer-events-none" : ""}`}
          >
            <div className={`p-4 rounded-full transition-colors ${isDragging ? "bg-primary/20" : "bg-muted/30"}`}>
              <Upload className={`w-8 h-8 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{isDragging ? "Drop files here" : "Drag & drop files here"}</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse — {project.language ? `${acceptStr} only` : "no language set"}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Max 10 MB per file</p>
            </div>
          </div>

          {/* Upload queue */}
          {uploadQueue.length > 0 && (
            <Card className="p-4 bg-card/50 border-border/50 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">
                  Uploads {hasActiveUploads && <span className="text-muted-foreground font-normal">— in progress</span>}
                </h3>
                {hasFinished && !hasActiveUploads && (
                  <Button variant="ghost" size="sm" onClick={clearFinished} className="h-7 text-xs">Clear all</Button>
                )}
              </div>
              <div className="space-y-2">
                {uploadQueue.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <FileIcon filename={item.file.name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground truncate">{item.file.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{formatBytes(item.file.size)}</span>
                      </div>
                      {item.status === "uploading" && <Progress value={item.progress} className="h-1 mt-1" />}
                      {item.status === "error" && <p className="text-xs text-destructive mt-0.5 truncate">{item.error}</p>}
                    </div>
                    <div className="flex-shrink-0">
                      {(item.status === "pending" || item.status === "uploading") && <Loader2 className={`w-4 h-4 animate-spin ${item.status === "uploading" ? "text-primary" : "text-muted-foreground"}`} />}
                      {item.status === "done"  && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                      {item.status === "error" && (
                        <Button variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => setUploadQueue((prev) => prev.filter((i) => i.id !== item.id))}>
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* File list */}
          {isLoadingFiles ? (
            <Card className="bg-card/50 border-border/50">
              <div className="divide-y divide-border/30">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Skeleton className="w-4 h-4 rounded flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-4 w-20 rounded-full" />
                      </div>
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="w-8 h-8 rounded flex-shrink-0" />
                  </div>
                ))}
              </div>
            </Card>
          ) : filesError ? (
            <Card className="p-4 border-destructive/30 bg-destructive/5">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                <p className="text-sm text-destructive flex-1">{filesError}</p>
                <Button variant="outline" size="sm" onClick={loadFiles}>Retry</Button>
              </div>
            </Card>
          ) : files.length === 0 ? (
            <Card className="p-8 bg-card/30 border-border/50 border-dashed">
              <div className="flex flex-col items-center gap-2 text-center">
                <FileCode className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No files yet</p>
                <p className="text-xs text-muted-foreground/60">Upload or import source files to start scanning</p>
              </div>
            </Card>
          ) : (
            <Card className="bg-card/50 border-border/50">
              <div className="divide-y divide-border/30">
                {files.map((file) => {
                  const uploaderName = resolveUploaderName(file.uploaded_by);
                  return (
                    <div key={file.name} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors group">

                      {/* File type icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        <FileIcon filename={file.name} />
                      </div>

                      {/* Two-row info block */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: filename + source badge */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground truncate">{file.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 h-4 flex-shrink-0 flex items-center gap-1 ${SOURCE_BADGE[file.source]}`}
                          >
                            {file.source === "github"
                              ? <Github className="w-2.5 h-2.5" />
                              : <Upload className="w-2.5 h-2.5" />
                            }
                            <span className="capitalize">{file.source}</span>
                            {file.source === "github" && file.github_branch && (
                              <span className="opacity-70">· {file.github_branch}</span>
                            )}
                          </Badge>
                        </div>

                        {/* Row 2: size · date · uploader — each piece visually separated */}
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                          <span className="text-muted-foreground/30 text-xs select-none">·</span>
                          <span className="text-xs text-muted-foreground">{formatDate(file.uploaded_at)}</span>
                          {uploaderName && (
                            <>
                              <span className="text-muted-foreground/30 text-xs select-none">·</span>
                              <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                                <User className="w-3 h-3 flex-shrink-0" />
                                {uploaderName}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action buttons — fade in on row hover */}
                      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Preview */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => handlePreview(file)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">Preview</TooltipContent>
                        </Tooltip>

                        {/* Download */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a href={file.url} download={file.name} target="_blank" rel="noreferrer">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                <Download className="w-4 h-4" />
                              </Button>
                            </a>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">Download</TooltipContent>
                        </Tooltip>

                        {/* Delete */}
                        <AlertDialog>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Delete</TooltipContent>
                          </Tooltip>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete File</AlertDialogTitle>
                              <AlertDialogDescription>
                                Delete "{file.name}"? This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteFile(file.name)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-border/30 bg-muted/10 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {files.length} file{files.length !== 1 ? "s" : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(files.reduce((s, f) => s + f.size, 0))} total
                </span>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── File Preview Dialog ─────────────────────────────────────────── */}
      {previewFile && (
        <Dialog open={previewExpanded} onOpenChange={(open) => { setPreviewExpanded(open); if (!open) { setPreviewFile(null); setPreviewContent(null); } }}>
          <DialogContent className="max-w-4xl w-[95vw] h-[88vh] flex flex-col p-0 gap-0">
            {/* Header */}
            <DialogHeader className="px-5 py-3 border-b border-border/50 shrink-0">
              <DialogTitle className="flex items-center gap-2 text-sm font-semibold min-w-0">
                <FileIcon filename={previewFile.name} />
                <span className="truncate">{previewFile.name}</span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 flex-shrink-0 flex items-center gap-1 ml-1 ${SOURCE_BADGE[previewFile.source]}`}>
                  {previewFile.source === "github" ? <Github className="w-2.5 h-2.5" /> : <Upload className="w-2.5 h-2.5" />}
                  <span className="capitalize">{previewFile.source}</span>
                  {previewFile.source === "github" && previewFile.github_branch && (
                    <span className="opacity-70">· {previewFile.github_branch}</span>
                  )}
                </Badge>
                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {getLanguageFromExt(previewFile.name)}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-normal">{formatBytes(previewFile.size)}</span>
                  {previewContent && (
                    <span className="text-xs text-muted-foreground font-normal">
                      · {previewContent.split("\n").length} lines
                    </span>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>

            {/* Content */}
            <div className="flex-1 overflow-auto bg-background/50">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <pre className="p-5 text-sm leading-relaxed font-mono text-foreground/90 w-fit min-w-full">
                  {previewContent?.split("\n").map((line, i) => (
                    <div key={i} className="flex hover:bg-muted/20 -mx-5 px-5">
                      <span className="inline-block w-12 shrink-0 text-right pr-5 text-muted-foreground/40 select-none">
                        {i + 1}
                      </span>
                      <span className="whitespace-pre">{line || " "}</span>
                    </div>
                  ))}
                </pre>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

    </DashboardLayout>
  );
};

export default ProjectDetail;
