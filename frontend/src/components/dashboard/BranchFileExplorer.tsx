import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FolderOpen, FolderClosed, FileText, FileCode2, FileJson, FileImage,
  ChevronRight, ChevronDown, Loader2, GitBranch, X, ArrowLeft,
  FileType, Info, Lock, Maximize2, RefreshCw, Search, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  fetchBranchFiles,
  fetchFileContent,
  getCachedBranchFiles,
  getCachedFileContent,
  invalidateBranchFilesCache,
  isBranchFilesCacheFresh,
  type BranchFileItem,
  type Team,
  type TeamRole,
} from "@/lib/teams-api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number | null;
  children: TreeNode[];
}

function buildTree(files: BranchFileItem[]): TreeNode[] {
  const root: TreeNode[] = [];

  // Sort: directories first, then alphabetical
  const sorted = [...files].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const file of sorted) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const partName = parts[i];
      const isLast = i === parts.length - 1;

      let existing = current.find(n => n.name === partName);
      if (!existing) {
        existing = {
          name: partName,
          path: parts.slice(0, i + 1).join("/"),
          type: isLast ? file.type : "directory",
          size: isLast ? file.size : null,
          children: [],
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  return root;
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const codeExts = ["ts", "tsx", "js", "jsx", "py", "java", "go", "rs", "c", "cpp", "h", "rb", "swift", "kt", "cs", "php", "vue", "svelte"];
  const jsonExts = ["json", "jsonc", "yaml", "yml", "toml", "xml"];
  const imgExts  = ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"];
  const configExts = ["env", "ini", "cfg", "conf", "lock"];

  if (codeExts.includes(ext))   return <FileCode2 className="h-4 w-4 text-blue-400 shrink-0" />;
  if (jsonExts.includes(ext))   return <FileJson  className="h-4 w-4 text-yellow-400 shrink-0" />;
  if (imgExts.includes(ext))    return <FileImage  className="h-4 w-4 text-purple-400 shrink-0" />;
  if (configExts.includes(ext)) return <FileType   className="h-4 w-4 text-orange-400 shrink-0" />;
  if (ext === "md" || ext === "mdx") return <FileText className="h-4 w-4 text-emerald-400 shrink-0" />;
  return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", java: "java", go: "go", rs: "rust", c: "c", cpp: "cpp", h: "c",
    rb: "ruby", swift: "swift", kt: "kotlin", cs: "csharp", php: "php",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml",
    md: "markdown", mdx: "markdown", html: "html", css: "css", scss: "scss",
    sql: "sql", sh: "bash", bash: "bash", zsh: "bash", ps1: "powershell",
    dockerfile: "dockerfile", gitignore: "text", env: "text",
    vue: "vue", svelte: "svelte",
  };
  return map[ext] ?? "text";
}

function getLanguageLabel(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const label = getLanguageFromPath(path);
  if (ext === "cpp" || ext === "cc" || ext === "cxx" || ext === "hpp") return "C++";
  if (ext === "c" || ext === "h") return "C";
  if (ext === "zip") return "ZIP";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getLanguageBadgeClass(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["cpp", "cc", "cxx", "hpp"].includes(ext)) return "bg-purple-500/20 text-purple-200 border-purple-500/30";
  if (["c", "h"].includes(ext)) return "bg-violet-500/20 text-violet-200 border-violet-500/30";
  if (ext === "zip") return "bg-amber-500/20 text-amber-200 border-amber-500/30";
  if (["md", "mdx"].includes(ext)) return "bg-muted/20 text-muted-foreground border-border/60";
  if (ext === "py") return "bg-blue-500/20 text-blue-200 border-blue-500/30";
  return "bg-muted/20 text-muted-foreground border-border/60";
}

// ---------------------------------------------------------------------------
// Tree Node Component
// ---------------------------------------------------------------------------

function FileTreeNode({
  node,
  depth,
  onFileClick,
  selectedPath,
}: {
  node: TreeNode;
  depth: number;
  onFileClick: (path: string) => void;
  selectedPath: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-muted/40 transition-colors text-left group"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          }
          {expanded
            ? <FolderOpen className="h-4 w-4 text-amber-400 shrink-0" />
            : <FolderClosed className="h-4 w-4 text-amber-400 shrink-0" />
          }
          <span className="text-sm font-medium text-foreground truncate">{node.name}</span>
          <span className="text-[10px] text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            {node.children.length} items
          </span>
        </button>
        {expanded && (
          <div className="animate-in slide-in-from-top-1 duration-150">
            {sortNodes(node.children).map(child => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                onFileClick={onFileClick}
                selectedPath={selectedPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  return (
    <button
      onClick={() => onFileClick(node.path)}
      className={`w-full flex items-center gap-1.5 py-1 px-2 rounded-md transition-colors text-left group ${
        isSelected
          ? "bg-primary/15 text-primary"
          : "hover:bg-muted/40 text-foreground"
      }`}
      style={{ paddingLeft: `${depth * 16 + 24}px` }}
    >
      {getFileIcon(node.name)}
      <span className={`text-sm truncate ${isSelected ? "font-medium" : ""}`}>{node.name}</span>
      {node.size !== null && (
        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
          {formatSize(node.size)}
        </span>
      )}
    </button>
  );
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface BranchFileExplorerProps {
  team: Team;
  currentUserRole: TeamRole;
  currentUserBranches: string[] | null;
  selectedBranch?: string;
  onSelectedBranchChange?: (branch: string) => void;
}

export default function BranchFileExplorer({
  team,
  currentUserRole,
  currentUserBranches,
  selectedBranch: externalSelectedBranch,
  onSelectedBranchChange,
}: BranchFileExplorerProps) {
  const isAdmin = currentUserRole === "admin";
  const isDeveloper = currentUserRole === "developer";
  const isViewer = currentUserRole === "viewer";

  // State
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [files, setFiles] = useState<BranchFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [fileSize, setFileSize] = useState<number>(0);
  const [expandedFile, setExpandedFile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [zipPreviewPath, setZipPreviewPath] = useState<string | null>(null);

  const handleSelectedBranchChange = useCallback((branch: string) => {
    setSelectedBranch(branch);
    onSelectedBranchChange?.(branch);
  }, [onSelectedBranchChange]);

  useEffect(() => {
    if (!externalSelectedBranch || externalSelectedBranch === selectedBranch) return;
    setSelectedBranch(externalSelectedBranch);
  }, [externalSelectedBranch, selectedBranch]);

  // Auto-select branch for developers: pick first assigned branch
  // Load cached content if available
  useEffect(() => {
    if (isDeveloper && currentUserBranches && currentUserBranches.length > 0) {
      const firstBranch = currentUserBranches[0];
      handleSelectedBranchChange(firstBranch);
      
      // Try to load cached files for this branch
      const cachedFiles = getCachedBranchFiles(team.id, firstBranch);
      if (cachedFiles) {
        setFiles(cachedFiles.files);
      }
    }
  }, [handleSelectedBranchChange, isDeveloper, currentUserBranches, team.id]);

  // Fetch file tree when branch changes — stale-while-revalidate
  useEffect(() => {
    if (!selectedBranch || !team.github_repo) return;

    let cancelled = false;

    // 1) Instant: show cached data if available
    const cached = getCachedBranchFiles(team.id, selectedBranch);
    if (cached) {
      setFiles(cached.files);
      // Only show spinner if cache is stale (background refresh still runs)
      if (!isBranchFilesCacheFresh(team.id, selectedBranch)) {
        setLoadingFiles(true);
      }
    } else {
      // No cache — show spinner
      setLoadingFiles(true);
      setFiles([]);
    }

    // Reset file selection on branch change
    setSelectedFile(null);
    setFileContent(null);
    setFileTreeError(null);

    // 2) Background: always fetch fresh data from API
    fetchBranchFiles(team.id, selectedBranch)
      .then(res => {
        if (!cancelled) {
          setFiles(res.files);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setFileTreeError(err.message ?? "Failed to load files");
        }
        // Only toast if there was no cached data to fall back on
        if (!cancelled && !cached) {
          toast.error(err.message ?? "Failed to load files");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });

    return () => { cancelled = true; };
  }, [selectedBranch, team.id, team.github_repo, refreshNonce]);

  const refreshCurrentBranchFiles = () => {
    if (!selectedBranch) return;
    invalidateBranchFilesCache(team.id, selectedBranch);
    setFiles([]);
    setSelectedFile(null);
    setFileContent(null);
    setFileTreeError(null);
    setLoadingFiles(true);
    setRefreshNonce(prev => prev + 1);
  };

  // Fetch file content when file is selected — module-level cache in teams-api.ts
  const handleFileClick = useCallback((path: string) => {
    if (path.toLowerCase().endsWith(".zip")) {
      setZipPreviewPath(path);
      return;
    }

    if (path === selectedFile) {
      setExpandedFile(true);
      return;
    }
    setSelectedFile(path);
    setExpandedFile(true);

    // Check module-level cache (survives navigation)
    const cached = getCachedFileContent(team.id, selectedBranch, path);
    if (cached) {
      setFileContent(cached.content);
      setFileSize(cached.size);
      return;
    }

    setFileContent(null);
    setLoadingContent(true);

    fetchFileContent(team.id, selectedBranch, path)
      .then(res => {
        setFileContent(res.content);
        setFileSize(res.size);
      })
      .catch(err => {
        toast.error(err.message ?? "Failed to load file content");
        setFileContent("[Error loading file content]");
      })
      .finally(() => setLoadingContent(false));
  }, [selectedBranch, selectedFile, team.id]);

  const visibleFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return files.filter(file => {
      if (file.type !== "file") return false;
      if (query && !file.path.toLowerCase().includes(query)) return false;
      if (languageFilter === "all") return true;
      const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
      if (languageFilter === "c") return ext === "c";
      if (languageFilter === "cpp") return ["cpp", "cc", "cxx", "hpp"].includes(ext);
      if (languageFilter === "c-cpp") return ["c", "h", "cpp", "cc", "cxx", "hpp"].includes(ext);
      if (languageFilter === "zip") return ext === "zip";
      return true;
    });
  }, [files, languageFilter, searchQuery]);

  // Build tree from flat file list
  const tree = useMemo(() => buildTree(visibleFiles), [visibleFiles]);

  // ── Viewer — no access ──────────────────────────────────────────────────
  if (isViewer) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Branch Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border/30">
            <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Viewers do not have access to branch files.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── No repo connected ────────────────────────────────────────────────────
  if (!team.github_repo) return null;

  // ── Developer without assigned branches ──────────────────────────────────
  if (isDeveloper && (!currentUserBranches || currentUserBranches.length === 0)) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Branch Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border/30">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              No branch assigned. Ask your team admin to assign you a branch to view files.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Main explorer ────────────────────────────────────────────────────────
  return (<>
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Branch Files
          </CardTitle>
          {selectedBranch && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={refreshCurrentBranchFiles}
              disabled={loadingFiles}
            >
              {loadingFiles ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh Files
            </Button>
          )}

          {/* Branch selector — admin can select from all branches */}
          {isAdmin ? (
            <div className="hidden">
              <span className="text-sm text-muted-foreground">Branch:</span>
              <Select value={selectedBranch} onValueChange={handleSelectedBranchChange}>
                <SelectTrigger className="w-56 h-9 bg-background/50 border-border/50 text-sm">
                  <SelectValue placeholder="Select a branch…" />
                </SelectTrigger>
                <SelectContent>
                  {team.github_branches.map(branch => (
                    <SelectItem key={branch} value={branch}>
                      <span className="flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                        {branch}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            /* Developer — dropdown of assigned branches */
            <div className="hidden">
              <span className="text-sm text-muted-foreground">Branch:</span>
              {currentUserBranches && currentUserBranches.length > 0 ? (
                <Select value={selectedBranch} onValueChange={handleSelectedBranchChange}>
                  <SelectTrigger className="w-56 h-9 bg-background/50 border-border/50 text-sm">
                    <SelectValue placeholder="Select a branch…" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentUserBranches.map(branch => (
                      <SelectItem key={branch} value={branch}>
                        <span className="flex items-center gap-2">
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          {branch}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className="text-xs bg-muted text-muted-foreground border-border/50">
                  No branches assigned
                </Badge>
              )}
            </div>
          )}
          <Select value={languageFilter} onValueChange={setLanguageFilter}>
            <SelectTrigger className="w-52 h-9 bg-background/50 border-border/50 text-sm">
              <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="c">Filter: C Files</SelectItem>
              <SelectItem value="cpp">Filter: C++ Files</SelectItem>
              <SelectItem value="c-cpp">Filter: C/C++ Files</SelectItem>
              <SelectItem value="zip">Filter: ZIP Files</SelectItem>
              <SelectItem value="all">Filter: All Files</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="relative mt-3 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search files..."
            className="h-9 bg-background/50 border-border/50 pl-9"
          />
        </div>
      </CardHeader>

      <CardContent>
        {/* No branch selected yet */}
        {!selectedBranch && (
          <div className="border-2 border-dashed border-border/50 rounded-lg p-8 flex flex-col items-center gap-3">
            <GitBranch className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Select a branch to browse files</p>
          </div>
        )}

        {/* Loading */}
        {selectedBranch && loadingFiles && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading file tree…</span>
          </div>
        )}

        {/* File explorer */}
        {selectedBranch && !loadingFiles && fileTreeError && files.length === 0 && (
          <div className="border-2 border-dashed border-destructive/40 rounded-lg p-8 flex flex-col items-center gap-3 text-center">
            <Info className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium text-foreground">Could not load files</p>
            <p className="text-sm text-muted-foreground max-w-lg">{fileTreeError}</p>
            <Button variant="outline" size="sm" onClick={() => {
              const branch = selectedBranch;
              setSelectedBranch("");
              requestAnimationFrame(() => setSelectedBranch(branch));
            }}>
              Try again
            </Button>
          </div>
        )}

        {/* File explorer */}
        {selectedBranch && !loadingFiles && !fileTreeError && visibleFiles.length > 0 && (
          <div className="border border-border/50 rounded-lg overflow-hidden bg-background/30">
            {/* Stats bar */}
            <div className="px-3 py-2 border-b border-border/50 bg-muted/20 flex items-center gap-3">
              <Badge variant="secondary" className="text-[10px] font-normal">
                {visibleFiles.filter(f => f.type === "file").length} files
              </Badge>
              <Badge variant="secondary" className="text-[10px] font-normal">
                {visibleFiles.filter(f => f.type === "directory").length} folders
              </Badge>
            </div>

            <div className="divide-y divide-border/50">
              <div className="grid grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_150px_90px] items-center px-4 py-2 text-xs font-medium text-muted-foreground">
                <span>File Name</span>
                <span>Path</span>
                <span>Language</span>
                <span className="text-right">Size</span>
              </div>
              {visibleFiles.map(file => {
                return (
                  <div
                    key={file.path}
                    className="grid grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_150px_90px] items-center px-4 py-2 text-sm hover:bg-muted/20"
                  >
                    <button
                      type="button"
                      onClick={() => handleFileClick(file.path)}
                      className="flex min-w-0 items-center gap-2 text-left font-medium hover:text-primary"
                    >
                      {getFileIcon(file.path)}
                      <span className="truncate">{file.path.split("/").pop()}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFileClick(file.path)}
                      className="truncate text-left text-muted-foreground hover:text-foreground"
                    >
                      {file.path}
                    </button>
                    <Badge variant="outline" className={`w-fit ${getLanguageBadgeClass(file.path)}`}>
                      {getLanguageLabel(file.path)}
                    </Badge>
                    <span className="text-right text-xs text-muted-foreground">{formatSize(file.size)}</span>
                  </div>
                );
              })}
            </div>

            <div className="hidden">
              {/* File tree panel */}
              <div className={`${selectedFile ? "lg:w-[320px] lg:border-r border-b lg:border-b-0" : "w-full"} border-border/50 shrink-0 overflow-hidden`}>
                <ScrollArea className="h-full">
                  <div className="py-1">
                    {sortNodes(tree).map(node => (
                      <FileTreeNode
                        key={node.path}
                        node={node}
                        depth={0}
                        onFileClick={handleFileClick}
                        selectedPath={selectedFile}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* File content panel */}
              {selectedFile && (
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                  {/* File header */}
                  <div className="px-3 py-2 border-b border-border/50 bg-muted/10 flex items-center gap-2 shrink-0 min-w-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 lg:hidden shrink-0"
                      onClick={() => { setSelectedFile(null); setFileContent(null); }}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    {getFileIcon(selectedFile)}
                    <span className="text-sm font-medium truncate min-w-0">{selectedFile}</span>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px]">
                        {getLanguageFromPath(selectedFile)}
                      </Badge>
                      {fileSize > 0 && (
                        <span className="text-[10px] text-muted-foreground">{formatSize(fileSize)}</span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="Open in full view"
                        onClick={() => setExpandedFile(true)}
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 hidden lg:flex"
                        onClick={() => { setSelectedFile(null); setFileContent(null); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Content area — absolute positioning gives hard width boundary for horizontal scroll */}
                  <div className="flex-1 relative">
                    <div className="absolute inset-0 overflow-auto">
                      {loadingContent ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <pre className="p-4 text-xs leading-relaxed font-mono text-foreground/90 w-fit min-w-full">
                          {fileContent?.split("\n").map((line, i) => (
                            <div key={i} className="flex hover:bg-muted/20 -mx-4 px-4">
                              <span className="inline-block w-10 shrink-0 text-right pr-4 text-muted-foreground/50 select-none">
                                {i + 1}
                              </span>
                              <span className="whitespace-pre">{line || " "}</span>
                            </div>
                          ))}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {selectedBranch && !loadingFiles && !fileTreeError && visibleFiles.length === 0 && (
          <div className="border-2 border-dashed border-border/50 rounded-lg p-8 flex flex-col items-center gap-3">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {files.length === 0 ? "No files found in this branch" : "No files match the current filters"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>

    {/* ── Full-screen file viewer dialog ──────────────────────────────── */}
    {selectedFile && (
      <Dialog open={expandedFile} onOpenChange={setExpandedFile}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b border-border/50 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              {getFileIcon(selectedFile)}
              <span className="truncate">{selectedFile}</span>
              <Badge variant="outline" className="text-[10px] ml-2 shrink-0">
                {getLanguageFromPath(selectedFile)}
              </Badge>
              {fileSize > 0 && (
                <span className="text-xs text-muted-foreground font-normal ml-2 shrink-0">
                  {formatSize(fileSize)}
                </span>
              )}
              {fileContent && (
                <span className="text-xs text-muted-foreground font-normal shrink-0">
                  · {fileContent.split("\n").length} lines
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-background/50">
            {loadingContent ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <pre className="p-5 text-sm leading-relaxed font-mono text-foreground/90 w-fit min-w-full">
                {fileContent?.split("\n").map((line, i) => (
                  <div key={i} className="flex hover:bg-muted/20 -mx-5 px-5">
                    <span className="inline-block w-14 shrink-0 text-right pr-5 text-muted-foreground/40 select-none">
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

    <Dialog open={!!zipPreviewPath} onOpenChange={(open) => !open && setZipPreviewPath(null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ZIP archive contents</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {zipPreviewPath} is a ZIP file. Code preview is disabled for archives.
          </p>
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Files available from this branch:</p>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {files
                .filter(file => file.type === "file" && file.path !== zipPreviewPath)
                .map(file => (
                  <div key={file.path} className="flex items-center gap-2 rounded px-2 py-1 text-sm">
                    {getFileIcon(file.path)}
                    <span className="truncate">{file.path}</span>
                  </div>
                ))}
              {files.filter(file => file.type === "file" && file.path !== zipPreviewPath).length === 0 && (
                <p className="text-sm text-muted-foreground">No extracted file names are available for this archive.</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>);
}
