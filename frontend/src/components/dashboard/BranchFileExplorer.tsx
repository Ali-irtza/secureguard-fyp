import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FolderOpen, FolderClosed, FileText, FileCode2, FileJson, FileImage,
  ChevronRight, ChevronDown, Loader2, GitBranch, X, ArrowLeft,
  FileType, Info, Lock, Maximize2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
}

export default function BranchFileExplorer({
  team,
  currentUserRole,
  currentUserBranches,
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

  // Auto-select branch for developers: pick first assigned branch
  // Load cached content if available
  useEffect(() => {
    if (isDeveloper && currentUserBranches && currentUserBranches.length > 0) {
      const firstBranch = currentUserBranches[0];
      setSelectedBranch(firstBranch);
      
      // Try to load cached files for this branch
      const cachedFiles = getCachedBranchFiles(team.id, firstBranch);
      if (cachedFiles) {
        setFiles(cachedFiles.files);
      }
    }
  }, [isDeveloper, currentUserBranches, team.id]);

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
    if (path === selectedFile) return;
    setSelectedFile(path);

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

  // Build tree from flat file list
  const tree = useMemo(() => buildTree(files), [files]);

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
      <CardHeader>
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
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Branch:</span>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
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
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Branch:</span>
              {currentUserBranches && currentUserBranches.length > 0 ? (
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
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
        {selectedBranch && !loadingFiles && !fileTreeError && files.length > 0 && (
          <div className="border border-border/50 rounded-lg overflow-hidden bg-background/30">
            {/* Stats bar */}
            <div className="px-3 py-2 border-b border-border/50 bg-muted/20 flex items-center gap-3">
              <Badge variant="secondary" className="text-[10px] font-normal">
                {files.filter(f => f.type === "file").length} files
              </Badge>
              <Badge variant="secondary" className="text-[10px] font-normal">
                {files.filter(f => f.type === "directory").length} folders
              </Badge>
            </div>

            <div className="flex flex-col lg:flex-row h-[500px]">
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
        {selectedBranch && !loadingFiles && !fileTreeError && files.length === 0 && (
          <div className="border-2 border-dashed border-border/50 rounded-lg p-8 flex flex-col items-center gap-3">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No files found in this branch</p>
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
  </>);
}
