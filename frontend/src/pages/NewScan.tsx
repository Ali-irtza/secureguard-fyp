import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  triggerScan,
  getBranchFiles,
  triggerUploadedFileScan,
  triggerUploadedFileScanStream,
  ScanResult,
  VulnerabilityDetail,
  ScanStreamEvent,
  ChunkOutput,
} from "@/lib/scans-api";
import {
  listProjects,
  createProject,
  deleteProject,
  fetchProjectBranchFiles,
  triggerProjectScan,
} from "@/lib/projects-api";
import { getTeam, listTeams } from "@/lib/teams-api";
import type { Team as ApiTeam } from "@/lib/teams-api";
import {
  listProjectFiles,
  listProjectSourceFiles,
  uploadProjectFile,
  formatFileSize,
  formatRelativeTime,
  type ProjectFileResponse,
} from "@/lib/project-files-api";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Upload,
  Github,
  Play,
  Shield,
  ArrowLeft,
  StopCircle,
  PanelLeftClose,
  PanelLeft,
  Lock,
  Info,
  Plus,
  Crown,
  Users,
  Eye,
  RefreshCw,
  Search,
  Check,
  ChevronsUpDown,
  AlertTriangle,
  Boxes,
  BrainCircuit,
  Clock3,
  FileUp,
  Radar,
  Sparkles,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeViewer } from "@/components/scan/CodeViewer";
import { ScanningProgress } from "@/components/scan/ScanningProgress";
import { FileUploadArea } from "@/components/scan/FileUploadArea";
import { toast } from "sonner";
import { addLocalNotification, getNotificationPreferences } from "@/lib/notifications";

interface CodeLine {
  lineNumber: number;
  content: string;
  status: "pending" | "scanning" | "safe" | "vulnerable";
  vulnerability?: string;
}

type ThinkingEventType = "info" | "warning" | "error" | "success";

const splitSourceLines = (source: string): string[] => {
  const lines = source.replace(/\r+\n/g, "\n").replace(/\r/g, "\n").split("\n");
  while (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.length > 0 ? lines : [""];
};

const ZIP_NO_SOURCE_MESSAGE =
  "This ZIP does not contain any C or C++ source files. Please upload a ZIP with .c, .cpp, .h, .hpp, .cc, .cxx, or .hxx files.";

const friendlyScanError = (message: string): string => {
  if (message.toLowerCase().includes("does not contain any c or c++ source files")) {
    return ZIP_NO_SOURCE_MESSAGE;
  }
  if (message.toLowerCase().includes("suspicious file name found")) {
    return message;
  }
  return message;
};

const isRenameFileError = (message: string): boolean =>
  message.toLowerCase().includes("suspicious file name found");

const getChunkReportTitle = (chunks: ChunkOutput[]): string => {
  const zipFolderName = chunks
    .map((chunk) => chunk.file_path ?? "")
    .find((filePath) => filePath.includes("/"))
    ?.split("/")[0]
    ?.trim();
  return zipFolderName || "Source Files";
};

const sourceLineForVulnerability = (chunk: ChunkOutput, vulnerability: VulnerabilityDetail): string => {
  const codeLines = splitSourceLines(chunk.code ?? "");
  const absoluteLine = vulnerability.line_number || vulnerability.absolute_line || 0;
  if (absoluteLine >= chunk.start_line && absoluteLine <= chunk.end_line) {
    return codeLines[absoluteLine - chunk.start_line] ?? "";
  }
  if (vulnerability.line_number > 0 && vulnerability.line_number <= codeLines.length) {
    return codeLines[vulnerability.line_number - 1] ?? "";
  }
  return "";
};

const codeForVulnerability = (chunk: ChunkOutput, vulnerability: VulnerabilityDetail): string => {
  const affectedCode = vulnerability.affected_code?.trim();
  if (affectedCode) return affectedCode;
  return sourceLineForVulnerability(chunk, vulnerability).trim() || `Line ${vulnerability.line_number || vulnerability.absolute_line || "N/A"}`;
};

const NumberedCodeBlock = ({
  code,
  startLine = 1,
  emptyText = "No code returned.",
}: {
  code?: string;
  startLine?: number;
  emptyText?: string;
}) => {
  const lines = splitSourceLines(code?.trimEnd() ? code : emptyText);
  return (
    <div className="mt-2 max-h-[420px] overflow-auto rounded-md border border-border/50 bg-[#0d1117] text-sm leading-relaxed text-foreground">
      <table className="w-full border-collapse font-mono">
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${index}-${line}`}>
              <td className="w-10 min-w-10 max-w-10 select-none border-r border-white/10 bg-white/[0.03] px-2 py-0.5 text-right align-top text-xs text-muted-foreground">
                {startLine + index}
              </td>
              <td className="whitespace-pre px-4 py-0.5 align-top">{line || " "}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const parseThinkingStep = (step: string) => {
  const match = step.match(/^\[(\d{2}:\d{2})\]\s+([^:]+):\s+(.*)$/);
  if (!match) {
    return { time: "", type: "Working", message: step };
  }
  return { time: match[1], type: match[2], message: match[3] };
};

const formatElapsedClock = (elapsedSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const getThinkingStyle = (message: string, type: string) => {
  const text = `${type} ${message}`.toLowerCase();
  if (type.toLowerCase().includes("error")) {
    return {
      label: "Attention",
      icon: AlertTriangle,
      className: "border-destructive/35 bg-destructive/10 text-destructive",
      dotClassName: "bg-destructive",
    };
  }
  if (text.includes("upload") || text.includes("source") || text.includes("file") || text.includes("package")) {
    return {
      label: "Intake",
      icon: FileUp,
      className: "border-blue-500/30 bg-blue-500/10 text-blue-300",
      dotClassName: "bg-blue-400",
    };
  }
  if (text.includes("chunk") || text.includes("static") || text.includes("review") || text.includes("vulnerab")) {
    return {
      label: "Analysis",
      icon: Radar,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      dotClassName: "bg-amber-400",
    };
  }
  if (text.includes("done") || text.includes("saved") || text.includes("complete") || text.includes("assembled") || text.includes("corrected")) {
    return {
      label: "Verdict",
      icon: Check,
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      dotClassName: "bg-emerald-400",
    };
  }
  return {
    label: "Node",
    icon: BrainCircuit,
    className: "border-primary/30 bg-primary/10 text-primary",
    dotClassName: "bg-primary",
  };
};

const NewScan = () => {
  const [searchParams] = useSearchParams();
  const autoStartRef = useRef(false);
  const [activeTab, setActiveTab] = useState("upload");
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [fileContent, setFileContent] = useState<string>("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  
  // New state for team-aware scanning
  const [projectName, setProjectName] = useState("");
  const [scanMode, setScanMode] = useState<"personal" | "team">("personal");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  // Project selector state
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedProjectName, setSelectedProjectName] = useState<string>("");
  // "new" means user wants to create a new project inline
  const [newProjectName, setNewProjectName] = useState<string>("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  // ── Project file list state (personal mode) ──────────────────────────────
  const [projectFiles, setProjectFiles] = useState<ProjectFileResponse[]>([]);
  const [projectFilesLoading, setProjectFilesLoading] = useState(false);
  const [projectFilesError, setProjectFilesError] = useState<string>("");
  const [autoRescanPreparing, setAutoRescanPreparing] = useState(false);
  // Set of file IDs that are checked for scanning
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [saveToProject, setSaveToProject] = useState<Record<number, boolean>>({});
  // Per-uploaded-file "save to project" toggle: index → boolean

  // Fetch projects for the selector
  const { data: projects = [], refetch: refetchProjects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  // Fetch real teams the user belongs to
  const { data: allTeams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: listTeams,
  });

  // The selected project object (if any)
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  // If the selected project belongs to a team, fetch that team's GitHub info
  const { data: projectTeam = null } = useQuery({
    queryKey: ["team", selectedProject?.team_id],
    queryFn: () => getTeam(selectedProject!.team_id!),
    enabled: !!selectedProject?.team_id,
  });

  // ── Fetch project files whenever a real project is selected ──────────────
  const fetchProjectFiles = useCallback(async (projectId: string) => {
    if (!projectId || projectId === "__new__") return;
    setProjectFilesLoading(true);
    setProjectFilesError("");
    try {
      const files = await listProjectFiles(projectId);
      setProjectFiles(files);
      // Default: select all files
      setSelectedFileIds(new Set(files.map((f) => f.id)));
    } catch (err: any) {
      setProjectFilesError(err.message || "Failed to load project files");
      setProjectFiles([]);
    } finally {
      setProjectFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId && selectedProjectId !== "__new__") {
      fetchProjectFiles(selectedProjectId);
    } else {
      setProjectFiles([]);
      setSelectedFileIds(new Set());
    }
  }, [selectedProjectId, fetchProjectFiles]);

  useEffect(() => {
    const rescanProjectId = searchParams.get("projectId");
    if (!rescanProjectId || projects.length === 0 || selectedProjectId) return;
    const project = projects.find((item) => item.id === rescanProjectId);
    if (!project) return;
    setScanMode(project.type === "team" ? "team" : "personal");
    setSelectedProjectId(project.id);
    setSelectedProjectName(project.name);
    setProjectName(project.name);
    if (project.team_id) setSelectedTeamId(project.team_id);
    setActiveTab("upload");
  }, [projects, searchParams, selectedProjectId]);

  useEffect(() => {
    if (searchParams.get("autoStart") !== "1" || autoStartRef.current || isScanning) return;
    if (!selectedProjectId || selectedProjectId === "__new__" || projectFilesLoading || selectedFileIds.size === 0) return;
    autoStartRef.current = true;
    handleStartScan();
  }, [searchParams, selectedProjectId, projectFilesLoading, selectedFileIds.size, isScanning]);

  // Selected team in team mode (real API team)
  const selectedApiTeam: ApiTeam | null = allTeams.find((t) => t.id === selectedTeamId) ?? null;
  const userTeamRole = selectedApiTeam?.current_user_role ?? null;
  const isViewer = userTeamRole === "viewer";
  const canScanInTeam = userTeamRole === "admin" || userTeamRole === "developer";
  const isTeamMode = scanMode === "team";

  // Current authenticated user — needed to resolve assigned branches
  const { user: currentUser } = useCurrentUser();

  // Branches visible to the current user for the selected team:
  // - admin  → all branches
  // - developer → only their assigned branches
  // - viewer → no branches (scan blocked anyway)
  const visibleTeamBranches: string[] = (() => {
    if (!selectedApiTeam?.github_branches?.length) return [];
    if (userTeamRole === "admin") return selectedApiTeam.github_branches;
    if (userTeamRole === "developer" && currentUser?.id) {
      const myMember = selectedApiTeam.members.find((m) => m.user_id === currentUser.id);
      const assigned = myMember?.branches ?? [];
      // Only show branches that exist in the synced branch list
      return assigned.filter((b) => selectedApiTeam.github_branches.includes(b));
    }
    return [];
  })();
  
  // Scanning state
  const [currentPhase, setCurrentPhase] = useState(0);
  const [currentLine, setCurrentLine] = useState(0);
  const [codeLines, setCodeLines] = useState<CodeLine[]>([]);
  const [stats, setStats] = useState({
    linesScanned: 0,
    totalLines: 0,
    vulnerabilitiesFound: 0,
    elapsedTime: 0,
  });
  
  // Abort ref for stopping scan
  const scanAbortRef = useRef(false);
  const sourceLineCountsRef = useRef<Record<string, number>>({});
  const scanStartedAtRef = useRef<number | null>(null);

  // New scan result state
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedVulnerability, setSelectedVulnerability] = useState<VulnerabilityDetail | null>(null);
  const [branchFiles, setBranchFiles] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string>("");
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [streamingChunks, setStreamingChunks] = useState<ChunkOutput[]>([]);

  // Panel visibility state
  const [showPanel, setShowPanel] = useState(true);

  // Reset branch when the selected team changes so we don't hold a stale/
  // inaccessible branch from a previous team selection.
  useEffect(() => {
    if (visibleTeamBranches.length > 0) {
      setBranch((prev) =>
        visibleTeamBranches.includes(prev) ? prev : visibleTeamBranches[0]
      );
    }
  }, [selectedTeamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select first scannable team when switching to team mode
  useEffect(() => {
    if (scanMode === "team" && allTeams.length > 0 && !selectedTeamId) {
      const adminTeam = allTeams.find((t) => t.current_user_role === "admin");
      const devTeam = allTeams.find((t) => t.current_user_role === "developer");
      setSelectedTeamId((adminTeam || devTeam || allTeams[0]).id);
    }
  }, [scanMode, allTeams]);

  // ── Detected language from first uploaded file ───────────────────────────
  // "C" | "C++" | null — null means no files yet
  const detectedProjectLanguage: "C" | "C++" | null =
    uploadedFiles.length === 0
      ? null
      : (() => {
          const firstSource = uploadedFiles.find((file) => {
            const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
            return ext !== "zip";
          });
          const ext = firstSource?.name.split(".").pop()?.toLowerCase() ?? "";
          if (ext === "c" || ext === "h") return "C";
          if (["cpp", "cc", "cxx", "hpp", "hxx"].includes(ext)) return "C++";
          return null;
        })();

  // ── Effective language for upload gating ─────────────────────────────────
  // If a real project is selected and it has a stored language, that is the
  // authoritative constraint — regardless of what has been uploaded so far.
  // This prevents uploading .cpp files into a C project and vice-versa.
  // Falls back to detectedProjectLanguage when no project is selected.
  const effectiveLanguage: "C" | "C++" | null =
    selectedProject?.language === "C"   ? "C"   :
    selectedProject?.language === "C++" ? "C++" :
    detectedProjectLanguage;

  // Accepted extensions for the file input — driven by effectiveLanguage
  const acceptedExtensions =
    effectiveLanguage === "C"
      ? ".c,.h"
      : effectiveLanguage === "C++"
      ? ".cpp,.cxx,.cc,.hpp,.hxx,.h"
      : ".c,.h,.cpp,.cxx,.cc,.hpp,.hxx,.h,.zip";

  /** Returns true if a file is compatible with the effective project language */
  const isCompatibleFile = (file: File): boolean => {
    if (!effectiveLanguage) return true; // no constraint yet
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    if (ext === ".zip") return true;
    if (effectiveLanguage === "C") return [".c", ".h"].includes(ext);
    if (effectiveLanguage === "C++")
      return [".cpp", ".cxx", ".cc", ".hpp", ".hxx", ".h"].includes(ext);
    return true;
  };

  /** Badge label + colour for a given filename */
  const getFileLangBadge = (filename: string): { label: string; className: string } | null => {
    const ext = "." + (filename.split(".").pop()?.toLowerCase() ?? "");
    if ([".c", ".h"].includes(ext))
      return { label: "C", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
    if ([".cpp", ".cxx", ".cc", ".hpp", ".hxx"].includes(ext))
      return { label: "C++", className: "bg-pink-500/20 text-pink-400 border-pink-500/30" };
    return null;
  };

  // Scan language string for CodeViewer / mock code ("c" | "cpp")
  const scanLang = effectiveLanguage === "C++" ? "cpp" : "c";

  const addLog = useCallback((message: string, type: ThinkingEventType = "info") => {
    const elapsedSeconds = scanStartedAtRef.current
      ? (Date.now() - scanStartedAtRef.current) / 1000
      : 0;
    const timestamp = formatElapsedClock(elapsedSeconds);
    const prefix = type === "error" ? "Error" : type === "warning" ? "Warning" : type === "success" ? "Done" : "Working";
    setThinkingSteps((prev) => [...prev, `[${timestamp}] ${prefix}: ${message}`]);
  }, []);

  const notifyScanFinished = useCallback((projectLabel: string, result: ScanResult) => {
    const preferences = getNotificationPreferences();
    if (preferences.scanCompleted) {
      toast.success("Scan completed", {
        description: `${projectLabel} finished with ${result.total_vulnerabilities} issue${result.total_vulnerabilities === 1 ? "" : "s"}.`,
      });
      addLocalNotification({
        title: "Scan completed",
        description: `${projectLabel} finished`,
        type: result.total_vulnerabilities > 0 ? "warning" : "success",
      });
    }
    if (preferences.criticalAlerts) {
      const criticalCount = result.vulnerabilities.filter((vulnerability) =>
        String(vulnerability.severity || "").toLowerCase() === "critical"
      ).length;
      if (criticalCount > 0) {
        toast.error("Critical vulnerability found", {
          description: `${criticalCount} critical issue${criticalCount === 1 ? "" : "s"} in ${projectLabel}.`,
        });
        addLocalNotification({
          title: "Critical vulnerability found",
          description: `${criticalCount} critical issue${criticalCount === 1 ? "" : "s"} in ${projectLabel}`,
          type: "critical",
        });
      }
    }
    if (scanMode === "team" && preferences.teamMemberScanned) {
      const memberName = currentUser?.user_metadata?.full_name || currentUser?.email || "A team member";
      toast.info("Team scan finished", {
        description: `${memberName} finished scan for ${projectLabel}.`,
      });
      addLocalNotification({
        title: "Team scan finished",
        description: `${memberName} finished scan for ${projectLabel}`,
        type: "info",
      });
    }
  }, [currentUser?.email, currentUser?.user_metadata?.full_name, scanMode]);

  const upsertStreamingChunk = useCallback((incoming: ChunkOutput) => {
    setStreamingChunks((prev) => {
      const key = `${incoming.file_path ?? ""}-${incoming.chunk_index}`;
      const existingIndex = prev.findIndex((chunk) => `${chunk.file_path ?? ""}-${chunk.chunk_index}` === key);
      if (existingIndex === -1) return [...prev, incoming];
      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], ...incoming };
      return next;
    });
  }, []);

  const replaceStreamingChunksForFile = useCallback((filePath: string, incomingChunks: ChunkOutput[]) => {
    setStreamingChunks((prev) => [
      ...prev.filter((chunk) => (chunk.file_path ?? "") !== filePath),
      ...incomingChunks,
    ]);
  }, []);

  const sanitizeScanResultChunkRanges = useCallback((result: ScanResult): ScanResult => {
    const chunkOutputs = result.chunk_outputs ?? [];
    const invalidFiles = new Set<string>();
    const chunksByFile = chunkOutputs.reduce<Record<string, ChunkOutput[]>>((groups, chunk) => {
      const filePath = chunk.file_path ?? "";
      groups[filePath] = [...(groups[filePath] ?? []), chunk];
      return groups;
    }, {});

    Object.entries(chunksByFile).forEach(([filePath, chunks]) => {
      const knownSourceLines =
        sourceLineCountsRef.current[filePath]
        ?? Math.max(0, ...chunks.map((chunk) => Number(chunk.source_line_count) || 0));
      const maxChunkEnd = Math.max(0, ...chunks.map((chunk) => Number(chunk.end_line) || 0));
      if (knownSourceLines > 0 && maxChunkEnd > knownSourceLines) {
        invalidFiles.add(filePath);
      }
    });

    if (invalidFiles.size === 0) return result;
    addLog(`Ignored stale chunk data for ${Array.from(invalidFiles).join(", ")}`, "warning");
    const sanitizedChunks = chunkOutputs.filter((chunk) => !invalidFiles.has(chunk.file_path ?? ""));
    return {
      ...result,
      total_chunks_scanned: sanitizedChunks.length,
      chunk_outputs: sanitizedChunks,
      files: result.files.map((file) => ({
        ...file,
        chunk_outputs: (file.chunk_outputs ?? []).filter((chunk) => !invalidFiles.has(chunk.file_path ?? file.filename)),
      })),
    };
  }, [addLog]);

  const handleScanStreamEvent = useCallback((event: ScanStreamEvent) => {
    switch (event.event) {
      case "scan_started":
        addLog(`Streaming scan started for ${event.total_files} file${event.total_files === 1 ? "" : "s"}`, "info");
        break;
      case "file_started":
        addLog(`Preparing ${event.file_path}`, "info");
        break;
      case "node":
        addLog(event.message, "info");
        break;
      case "chunks_ready":
        {
          const knownSourceLines = event.source_lines ?? sourceLineCountsRef.current[event.file_path] ?? 0;
          const maxChunkEnd = Math.max(0, ...event.chunks.map((chunk) => Number(chunk.end_line) || 0));
          if (knownSourceLines > 0 && maxChunkEnd > knownSourceLines) {
            addLog(
              `Ignored stale chunk stream for ${event.file_path}: chunk line ${maxChunkEnd} exceeds source line count ${knownSourceLines}`,
              "warning"
            );
            break;
          }
          const chunks = event.chunks.map((chunk) => ({
            ...chunk,
            file_path: chunk.file_path ?? event.file_path,
            source_line_count: (chunk.source_line_count ?? knownSourceLines) || undefined,
            chunker_version: chunk.chunker_version ?? event.chunker_version,
          }));
          addLog(
            `${event.total_chunks} semantic chunk${event.total_chunks === 1 ? "" : "s"} ready for ${event.file_path}${event.chunker_version ? ` (${event.chunker_version})` : ""}`,
            "success"
          );
          replaceStreamingChunksForFile(event.file_path, chunks);
          setScanResult((prev) => {
            const previousChunks = prev?.chunk_outputs ?? [];
            const keptChunks = previousChunks.filter((chunk) => (chunk.file_path ?? "") !== event.file_path);
            return {
              status: "streaming",
              total_vulnerabilities: prev?.total_vulnerabilities ?? 0,
              overall_risk_level: prev?.overall_risk_level ?? "Scanning",
              overall_risk_score: prev?.overall_risk_score ?? 0,
              files_analyzed: prev?.files_analyzed ?? 0,
              total_chunks_scanned: keptChunks.length + chunks.length,
              files_summary: prev?.files_summary ?? [],
              vulnerabilities: prev?.vulnerabilities ?? [],
              corrected_code: prev?.corrected_code ?? "Pending...",
              files: prev?.files ?? [],
              chunk_outputs: [...keptChunks, ...chunks],
              scan_id: prev?.scan_id ?? null,
            };
          });
        }
        break;
      case "chunk_started":
        addLog(event.message, "info");
        break;
      case "chunk_result":
        upsertStreamingChunk(event.chunk);
        setScanResult((prev) => {
          const previousChunks = prev?.chunk_outputs ?? [];
          const key = `${event.chunk.file_path ?? ""}-${event.chunk.chunk_index}`;
          const filtered = previousChunks.filter((chunk) => `${chunk.file_path ?? ""}-${chunk.chunk_index}` !== key);
          const vulnerabilities = [...filtered, event.chunk].flatMap((chunk) => chunk.vulnerabilities ?? []);
          return {
            status: "streaming",
            total_vulnerabilities: vulnerabilities.length,
            overall_risk_level: "Scanning",
            overall_risk_score: prev?.overall_risk_score ?? 0,
            files_analyzed: prev?.files_analyzed ?? 0,
            total_chunks_scanned: filtered.length + 1,
            files_summary: prev?.files_summary ?? [],
            vulnerabilities,
            corrected_code: prev?.corrected_code ?? "Pending...",
            files: prev?.files ?? [],
            chunk_outputs: [...filtered, event.chunk],
            scan_id: prev?.scan_id ?? null,
          };
        });
        addLog(`${event.chunk.file_path ?? event.file_path}: chunk ${event.chunk.chunk_index} streamed with ${event.chunk.vulnerabilities.length} issue${event.chunk.vulnerabilities.length === 1 ? "" : "s"}`, event.chunk.vulnerabilities.length ? "warning" : "success");
        break;
      case "correction_started":
        addLog(event.message, "info");
        break;
      case "correction_result":
        setStreamingChunks((prev) => prev.map((chunk) =>
          (chunk.file_path === event.file_path && chunk.chunk_index === event.chunk_index)
            ? { ...chunk, corrected_code: event.corrected_code }
            : chunk
        ));
        setScanResult((prev) => prev ? {
          ...prev,
          chunk_outputs: (prev.chunk_outputs ?? []).map((chunk) =>
            (chunk.file_path === event.file_path && chunk.chunk_index === event.chunk_index)
              ? { ...chunk, corrected_code: event.corrected_code }
              : chunk
          ),
        } : prev);
        addLog(`Corrected code streamed for ${event.file_path}: chunk ${event.chunk_index}`, "success");
        break;
      case "scan_result":
        {
          const sanitizedResult = sanitizeScanResultChunkRanges(event.result);
          setScanResult(sanitizedResult);
          const finalChunks = sanitizedResult.chunk_outputs ?? [];
          if (finalChunks.length > 0) {
            setStreamingChunks(finalChunks);
          }
        }
        addLog("Final report assembled", "success");
        break;
      case "error":
        addLog(event.message, "error");
        break;
    }
  }, [addLog, replaceStreamingChunksForFile, sanitizeScanResultChunkRanges, upsertStreamingChunk]);

  const renderThinkingStream = (emptyText: string) => {
    const activeIndex = thinkingSteps.length - 1;

    return (
      <div className="space-y-3">
        {thinkingSteps.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          thinkingSteps.map((step, index) => {
            const parsed = parseThinkingStep(step);
            const style = getThinkingStyle(parsed.message, parsed.type);
            const Icon = style.icon;
            const isActive = isScanning && index === activeIndex;
            return (
              <div
                key={`${step}-${index}`}
                className={cn(
                  "group rounded-md border p-3 transition-all duration-300 animate-slide-up",
                  style.className,
                  isActive && "shadow-[0_0_24px_rgba(16,185,129,0.14)]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("relative grid h-7 w-7 place-items-center rounded-full bg-background/50", isActive && "animate-pulse")}>
                      <Icon className="h-3.5 w-3.5" />
                      {isActive && (
                        <span className={cn("absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full animate-ping", style.dotClassName)} />
                      )}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide">{style.label}</span>
                  </div>
                  {parsed.time && (
                    <span className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {parsed.time}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">{parsed.message}</p>
                {isActive && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:240ms]" />
                    <span className="ml-1">streaming</span>
                    <span className="ml-auto h-4 w-1.5 animate-pulse rounded-sm bg-current" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  };

  const handleStopScan = () => {
    scanAbortRef.current = true;
    setIsScanning(false);
    addLog("Scan cancelled by user", "warning");
  };

  const handleStartScan = async () => {
    const isAutoRescan = searchParams.get("autoStart") === "1";
    scanAbortRef.current = false;
    scanStartedAtRef.current = Date.now();
    setAutoRescanPreparing(isAutoRescan);
    setIsScanning(true);
    setScanComplete(false);
    setScanResult(null);
    setScanError("");
    setStreamingChunks([]);
    setCurrentPhase(0);
    setCurrentLine(0);
    setThinkingSteps(["Preparing source files", "Building semantic chunks", "Waiting for chunk analysis"]);

    // Resolve project id/name — create new project if needed
    let resolvedProjectId = selectedProjectId;
    let resolvedProjectName = selectedProjectName || projectName;
    let createdProjectDuringScan = false;

    if (selectedProjectId === "__new__") {
      const trimmedName = newProjectName.trim();
      if (!/^[a-zA-Z]/.test(trimmedName)) {
        toast.error("Invalid Project Name", { description: "Project name must start with a letter." });
        setIsScanning(false);
        return;
      }
      try {
        const created = await createProject({
          name: trimmedName,
          type: scanMode,
          language: detectedProjectLanguage ?? undefined,
          team_id: scanMode === "team" ? selectedTeamId : undefined,
        });
        resolvedProjectId = created.id;
        resolvedProjectName = created.name;
        createdProjectDuringScan = true;
        if (getNotificationPreferences().newProject) {
          toast.info("New project added", { description: `${created.name} was created.` });
          addLocalNotification({
            title: "New project added",
            description: `${created.name} was created`,
            type: "info",
          });
        }
        await refetchProjects();
      } catch (err: any) {
        setScanError(err.message || "Failed to create project");
        setIsScanning(false);
        return;
      }
    }

    const firstFile = uploadedFiles[0];

    // ── UPLOAD MODE ──────────────────────────────────────────────────────────
    if (activeTab === "upload") {
      // Step 1: Upload files marked "save to project" before scanning
      if (false && resolvedProjectId && resolvedProjectId !== "__new__") {
        for (let i = 0; i < uploadedFiles.length; i++) {
          if (saveToProject[i] !== false) {
            // default is true when a real project is selected
            try {
              addLog(`Uploading ${uploadedFiles[i].name} to project...`, "info");
              await uploadProjectFile(resolvedProjectId, uploadedFiles[i]);
              addLog(`Saved ${uploadedFiles[i].name} to project`, "success");
            } catch (err: any) {
              addLog(`Warning: could not save ${uploadedFiles[i].name} — ${err.message}`, "warning");
            }
          }
        }
      }

      // Step 2: Collect all files to scan:
      //   a) selected existing project files (read their content from the URL)
      //   b) newly uploaded files
      type FileTuple = { name: string; content: string };
      const filesToScan: FileTuple[] = [];

      // Existing project files that are checked
      if (isAutoRescan && resolvedProjectId && resolvedProjectId !== "__new__") {
        setAutoRescanPreparing(true);
        try {
          const sourceFiles = await listProjectSourceFiles(resolvedProjectId);
          for (const sourceFile of sourceFiles) {
            filesToScan.push({ name: sourceFile.name, content: sourceFile.content });
          }
        } finally {
          setAutoRescanPreparing(false);
        }
      } else if (projectFiles.length > 0 && selectedFileIds.size > 0) {
        const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
        for (const pf of projectFiles) {
          if (!selectedFileIds.has(pf.id)) continue;
          try {
            const fileRes = await fetch(pf.url, {
              headers: session?.access_token
                ? { Authorization: `Bearer ${session.access_token}` }
                : {},
            });
            if (fileRes.ok) {
              const text = await fileRes.text();
              filesToScan.push({ name: pf.name, content: text });
            }
          } catch {
            addLog(`Warning: could not read ${pf.name} from project`, "warning");
          }
        }
      }

      // Newly uploaded files
      for (const file of uploadedFiles) {
        if (file.name.toLowerCase().endsWith(".zip")) continue;
        const text = await file.text();
        filesToScan.push({ name: file.name, content: text });
      }

      if (filesToScan.length === 0 && uploadedFiles.length === 0) {
        setScanError("Select at least one C/C++ file or ZIP archive to scan.");
        setIsScanning(false);
        return;
      }

      // Use the first file for the code viewer animation
      const primaryFile = filesToScan[0];
      const code = primaryFile?.content ?? "";
      const lines = splitSourceLines(code);
      sourceLineCountsRef.current = filesToScan.reduce<Record<string, number>>((counts, file) => {
        counts[file.name] = splitSourceLines(file.content).length;
        return counts;
      }, {});

      const initialLines: CodeLine[] = lines.map((content, index) => ({
        lineNumber: index + 1,
        content,
        status: "pending" as const,
      }));
      setCodeLines(initialLines);
      setStats({ linesScanned: 0, totalLines: lines.length, vulnerabilitiesFound: 0, elapsedTime: 0 });

      addLog("Preparing source package...", "info");
      setCurrentPhase(1);
      addLog("Collecting static evidence...", "info");
      await new Promise(r => setTimeout(r, 600));
      setCurrentPhase(2);
      const zipUploadCount = uploadedFiles.filter((file) => file.name.toLowerCase().endsWith(".zip")).length;
      const pendingUploadCount = filesToScan.length + zipUploadCount;
      addLog(
        zipUploadCount > 0
          ? `Reviewing ${pendingUploadCount} upload${pendingUploadCount === 1 ? "" : "s"}; ZIP archives will be filtered on the backend.`
          : `Reviewing ${filesToScan.length} file${filesToScan.length === 1 ? "" : "s"} for vulnerabilities...`,
        "info"
      );

      const startTime = Date.now();
      const timerInterval = setInterval(() => {
        setStats(prev => ({ ...prev, elapsedTime: Math.floor((Date.now() - startTime) / 1000) }));
      }, 1000);

      // Animate lines while waiting for real API response
      let animIndex = 0;
      const lineAnimInterval = setInterval(() => {
        if (animIndex < lines.length) {
          setCurrentLine(animIndex + 1);
          setCodeLines(prev => prev.map((line, idx) => {
            if (idx === animIndex) return { ...line, status: "scanning" };
            if (idx < animIndex) return { ...line, status: "safe" };
            return line;
          }));
          setStats(prev => ({ ...prev, linesScanned: animIndex + 1 }));
          animIndex++;
        }
      }, 80);

      try {
        let combinedResult: ScanResult | null = null;

        if (uploadedFiles.length > 0) {
          combinedResult = await triggerUploadedFileScanStream(
            uploadedFiles,
            {
              project_id: resolvedProjectId ?? "",
              project_name: resolvedProjectName ?? "",
            },
            handleScanStreamEvent
          );
        } else {
          const rescanFiles = filesToScan.map(
            (fileTuple) => new File([fileTuple.content], fileTuple.name, { type: "text/plain" })
          );
          combinedResult = await triggerUploadedFileScanStream(
            rescanFiles,
            {
              project_id: resolvedProjectId ?? "",
              project_name: resolvedProjectName ?? "",
            },
            handleScanStreamEvent
          );
        }

        clearInterval(lineAnimInterval);
        clearInterval(timerInterval);

        if (!combinedResult) throw new Error("No scan results returned");
        combinedResult = sanitizeScanResultChunkRanges(combinedResult);

        // Mark vulnerable lines on the code viewer (primary file only)
        setCodeLines(prev => prev.map((line) => {
          const vuln = combinedResult!.vulnerabilities.find(v => v.absolute_line === line.lineNumber);
          return { ...line, status: vuln ? "vulnerable" : "safe", vulnerability: vuln?.cwe_name };
        }));

        setStats(prev => ({
          ...prev,
          linesScanned: lines.length,
          vulnerabilitiesFound: combinedResult!.total_vulnerabilities,
          elapsedTime: Math.floor((Date.now() - startTime) / 1000),
        }));

        setScanResult(combinedResult);
        setThinkingSteps([
          ...(combinedResult.chunk_outputs ?? []).map(
            (chunk) =>
              `Chunk ${chunk.chunk_index}: ${chunk.chunk_name} lines ${chunk.start_line}-${chunk.end_line} reviewed with ${chunk.vulnerabilities.length} issue${chunk.vulnerabilities.length === 1 ? "" : "s"}.`
          ),
          "Report assembled",
        ]);
        setSelectedVulnerability(combinedResult.vulnerabilities[0] ?? null);
        setCurrentPhase(3);
        setCurrentPhase(4);
        addLog("Assembling report...", "info");
        await new Promise(r => setTimeout(r, 500));
        setCurrentPhase(5);
        notifyScanFinished(resolvedProjectName || primaryFile?.name || "Security scan", combinedResult);
        addLog(`Found ${combinedResult.total_vulnerabilities} vulnerabilities — Risk: ${combinedResult.overall_risk_level}`, combinedResult.total_vulnerabilities > 0 ? "warning" : "success");
        addLog("Scan complete!", "success");

      } catch (err: any) {
        clearInterval(lineAnimInterval);
        clearInterval(timerInterval);
        if (createdProjectDuringScan && resolvedProjectId && err.message?.includes("syntax error")) {
          await deleteProject(resolvedProjectId).catch(() => undefined);
          await refetchProjects();
        }
        const message = friendlyScanError(err.message || "Scan failed");
        setScanError(message);
        addLog(`Error: ${message}`, "warning");
      }

      setIsScanning(false);
      setScanComplete(true);
      return;
    }

    // ── GITHUB MODE — personal project with directly-connected repo ─────────
    if (activeTab === "github" && !isTeamMode && selectedProject?.github_repo) {
      const startTime = Date.now();
      const timerInterval = setInterval(() => {
        setStats(prev => ({ ...prev, elapsedTime: Math.floor((Date.now() - startTime) / 1000) }));
      }, 1000);

      setCodeLines([]);
      setStats({ linesScanned: 0, totalLines: 0, vulnerabilitiesFound: 0, elapsedTime: 0 });
      sourceLineCountsRef.current = {};

      try {
        addLog("Preparing source package...", "info");
        setCurrentPhase(1);

        addLog(`Fetching files from branch: ${branch}...`, "info");
        const filesResponse = await fetchProjectBranchFiles(resolvedProjectId, branch);
        // Filter to C/C++ files only (mirrors team scan behaviour)
        const C_CPP_EXTS = [".c", ".cpp", ".h", ".hpp", ".cc", ".cxx", ".hxx"];
        const files = filesResponse.files
          .filter((f) => f.type === "file" && C_CPP_EXTS.some((ext) => f.path.toLowerCase().endsWith(ext)))
          .map((f) => f.path);
        setBranchFiles(files);
        addLog(`Found ${files.length} C/C++ file${files.length === 1 ? "" : "s"}`, "success");

        setCurrentPhase(2);
        addLog("Reviewing files for vulnerabilities...", "info");
        addLog("This may take a moment depending on file count...", "info");

        const result = await triggerProjectScan(
          resolvedProjectId,
          branch,
          files,
          {
            project_id: resolvedProjectId ?? "",
            project_name: resolvedProjectName ?? "",
          }
        );

        clearInterval(timerInterval);

        setStats({
          linesScanned: result.total_chunks_scanned,
          totalLines: result.total_chunks_scanned,
          vulnerabilitiesFound: result.total_vulnerabilities,
          elapsedTime: Math.floor((Date.now() - startTime) / 1000),
        });

        setScanResult(result);
        setThinkingSteps([
          ...(result.chunk_outputs ?? []).map(
            (chunk) =>
              `Chunk ${chunk.chunk_index}: ${chunk.chunk_name} lines ${chunk.start_line}-${chunk.end_line} reviewed with ${chunk.vulnerabilities.length} issue${chunk.vulnerabilities.length === 1 ? "" : "s"}.`
          ),
          "Report assembled",
        ]);
        setCurrentPhase(3);
        setCurrentPhase(4);
        addLog("Assembling report...", "info");
        await new Promise(r => setTimeout(r, 500));
        setCurrentPhase(5);
        notifyScanFinished(resolvedProjectName || selectedProject?.name || "Security scan", result);
        addLog(`Found ${result.total_vulnerabilities} vulnerabilities — Risk: ${result.overall_risk_level}`, result.total_vulnerabilities > 0 ? "warning" : "success");
        addLog("Scan complete!", "success");

      } catch (err: any) {
        clearInterval(timerInterval);
        if (createdProjectDuringScan && resolvedProjectId && err.message?.includes("syntax error")) {
          await deleteProject(resolvedProjectId).catch(() => undefined);
          await refetchProjects();
        }
        const message = friendlyScanError(err.message || "Scan failed");
        setScanError(message);
        addLog(`Error: ${message}`, "warning");
      }

      setIsScanning(false);
      setScanComplete(true);
      return;
    }

    // ── GITHUB MODE — team project ───────────────────────────────────────────
    // Team mode uses the selected team directly; personal mode uses the
    // project's team if it has one.
    const effectiveTeamId = isTeamMode
      ? selectedTeamId
      : (projectTeam?.id ?? "");

    if (activeTab === "github" && effectiveTeamId) {
      const startTime = Date.now();
      const timerInterval = setInterval(() => {
        setStats(prev => ({ ...prev, elapsedTime: Math.floor((Date.now() - startTime) / 1000) }));
      }, 1000);

      setCodeLines([]);
      setStats({ linesScanned: 0, totalLines: 0, vulnerabilitiesFound: 0, elapsedTime: 0 });
      sourceLineCountsRef.current = {};

      try {
        addLog("Preparing source package...", "info");
        setCurrentPhase(1);

        addLog(`Fetching C/C++ files from branch: ${branch}...`, "info");
        const files = await getBranchFiles(effectiveTeamId, branch);
        setBranchFiles(files);
        addLog(`Found ${files.length} C/C++ files`, "success");

        setCurrentPhase(2);
        addLog("Reviewing files for vulnerabilities...", "info");
        addLog("This may take a moment depending on file count...", "info");

        const result = await triggerScan(effectiveTeamId, branch, files, {
          project_id: resolvedProjectId ?? "",
          project_name: resolvedProjectName ?? "",
        });

        clearInterval(timerInterval);

        setStats({
          linesScanned: result.total_chunks_scanned,
          totalLines: result.total_chunks_scanned,
          vulnerabilitiesFound: result.total_vulnerabilities,
          elapsedTime: Math.floor((Date.now() - startTime) / 1000),
        });

        setScanResult(result);
        setThinkingSteps([
          ...(result.chunk_outputs ?? []).map(
            (chunk) =>
              `Chunk ${chunk.chunk_index}: ${chunk.chunk_name} lines ${chunk.start_line}-${chunk.end_line} reviewed with ${chunk.vulnerabilities.length} issue${chunk.vulnerabilities.length === 1 ? "" : "s"}.`
          ),
          "Report assembled",
        ]);
        setCurrentPhase(3);
        setCurrentPhase(4);
        addLog("Assembling report...", "info");
        await new Promise(r => setTimeout(r, 500));
        setCurrentPhase(5);
        notifyScanFinished(resolvedProjectName || selectedApiTeam?.name || "Team scan", result);
        addLog(`Found ${result.total_vulnerabilities} vulnerabilities — Risk: ${result.overall_risk_level}`, result.total_vulnerabilities > 0 ? "warning" : "success");
        addLog("Scan complete!", "success");

      } catch (err: any) {
        clearInterval(timerInterval);
        if (createdProjectDuringScan && resolvedProjectId && err.message?.includes("syntax error")) {
          await deleteProject(resolvedProjectId).catch(() => undefined);
          await refetchProjects();
        }
        const message = friendlyScanError(err.message || "Scan failed");
        setScanError(message);
        addLog(`Error: ${message}`, "warning");
      }

      setIsScanning(false);
      setScanComplete(true);
      return;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const newFiles = Array.from(e.dataTransfer.files).filter((f) => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`File too large: ${f.name}`, {
          description: "File size exceeds the 10 MB limit.",
        });
        return false;
      }
      if (projectFiles.some(pf => pf.name === f.name) || uploadedFiles.some(uf => uf.name === f.name)) {
        toast.error(`Duplicate file: ${f.name}`, {
          description: "A file with this name already exists in the project or upload list.",
        });
        return false;
      }
      if (!isCompatibleFile(f)) {
        toast.error(`Wrong file type: ${f.name}`, {
          description: `This project uses ${effectiveLanguage ?? detectedProjectLanguage}. Only ${acceptedExtensions} files are allowed.`,
        });
        return false;
      }
      return true;
    });
    if (newFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...newFiles]);
      if (uploadedFiles.length === 0) {
        const reader = new FileReader();
        reader.onload = (ev) => setFileContent(ev.target?.result as string || "");
        reader.readAsText(newFiles[0]);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []).filter((f) => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`File too large: ${f.name}`, {
          description: "File size exceeds the 10 MB limit.",
        });
        return false;
      }
      if (projectFiles.some(pf => pf.name === f.name) || uploadedFiles.some(uf => uf.name === f.name)) {
        toast.error(`Duplicate file: ${f.name}`, {
          description: "A file with this name already exists in the project or upload list.",
        });
        return false;
      }
      if (!isCompatibleFile(f)) {
        toast.error(`Wrong file type: ${f.name}`, {
          description: `This project uses ${effectiveLanguage ?? detectedProjectLanguage}. Only ${acceptedExtensions} files are allowed.`,
        });
        return false;
      }
      return true;
    });
    e.target.value = "";
    if (newFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...newFiles]);
      if (uploadedFiles.length === 0) {
        const reader = new FileReader();
        reader.onload = (ev) => setFileContent(ev.target?.result as string || "");
        reader.readAsText(newFiles[0]);
      }
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setFileContent("");
      } else if (index === 0 && next.length > 0) {
        // Re-read first file
        const reader = new FileReader();
        reader.onload = (ev) => {
          setFileContent(ev.target?.result as string || "");
        };
        reader.readAsText(next[0]);
      }
      return next;
    });
  };

  const handleReset = () => {
    setIsScanning(false);
    setScanComplete(false);
    setCurrentPhase(0);
    setCurrentLine(0);
    setCodeLines([]);
    setUploadedFiles([]);
    setFileContent("");
    setRepoUrl("");
    setProjectName("");
    setSelectedProjectId("");
    setSelectedProjectName("");
    setNewProjectName("");
    setIsCreatingProject(false);
    setScanResult(null);
    setBranchFiles([]);
    setScanError("");
    setThinkingSteps([]);
    setStreamingChunks([]);
    sourceLineCountsRef.current = {};
    scanStartedAtRef.current = null;
    setProjectFiles([]);
    setSelectedFileIds(new Set());
    setSaveToProject({});
    setStats({
      linesScanned: 0,
      totalLines: 0,
      vulnerabilitiesFound: 0,
      elapsedTime: 0,
    });
  };

  // For GitHub tab: valid when there's a team with a connected repo + branch selected,
  // or a personal project with a directly-connected github_repo + branch selected.
  const githubReady = isTeamMode
    ? !!(selectedApiTeam?.github_repo && branch && visibleTeamBranches.includes(branch))
    : selectedProject?.team_id
      ? !!(projectTeam?.github_repo && branch)
      : !!(selectedProject?.github_repo && branch);

  // Resolve the effective project name for validation
  const effectiveProjectName = selectedProjectId === "__new__"
    ? newProjectName.trim()
    : (selectedProjectName || projectName).trim();

  // Team viewers cannot scan; in personal mode a project must be selected/named;
  // in team mode a team must be selected and the user must be admin/developer.
  // In personal upload mode: can scan if there are uploaded files OR selected project files.
  const hasFilesToScan =
    uploadedFiles.length > 0 || selectedFileIds.size > 0;

  const canStartScan =
    !isViewer &&
    (isTeamMode
      ? !!(selectedTeamId && canScanInTeam) && (activeTab === "upload" ? hasFilesToScan : githubReady)
      : activeTab === "github"
        // GitHub tab (personal): need a real project with a connected repo + branch
        ? !!(selectedProjectId && selectedProjectId !== "__new__" && githubReady)
        // Upload tab (personal): need a name + files
        : effectiveProjectName !== "" && hasFilesToScan
    );

  // Determine GitHub tab behavior based on selected project / team mode
  const renderGitHubTab = () => {
    // ── Team mode: use the selected team's connected repo ───────────────────
    if (isTeamMode && selectedApiTeam) {
      if (!selectedApiTeam.github_repo) {
        return (
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-8">
              <Info className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                No repository connected to <span className="font-medium">{selectedApiTeam.name}</span>.
              </p>
              <p className="text-xs text-muted-foreground text-center">
                Ask a team admin to connect a GitHub repository first.
              </p>
            </div>
          </CardContent>
        );
      }

      return (
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Repository</Label>
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={selectedApiTeam.github_repo}
                readOnly
                className="pl-10 pr-10 opacity-75 bg-muted/30"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch" className="text-sm font-medium">Branch</Label>
            {/* Developer with no assigned branches */}
            {userTeamRole === "developer" && visibleTeamBranches.length === 0 ? (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">
                  No branches assigned to you. Ask your team admin to assign branches before scanning.
                </p>
              </div>
            ) : visibleTeamBranches.length > 0 ? (
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger id="branch">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  {visibleTeamBranches.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">
                No branches found. Try syncing the repository from team settings.
              </p>
            )}
          </div>
        </CardContent>
      );
    }

    // ── Personal mode: project with a connected team repo ───────────────────
    if (selectedProject?.team_id) {
      if (!projectTeam) {
        return (
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Loading repository info...</p>
          </CardContent>
        );
      }

      if (!projectTeam.github_repo) {
        return (
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-8">
              <Info className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                No repository connected to this project's team.
              </p>
              <p className="text-xs text-muted-foreground text-center">
                Ask a team admin to connect a GitHub repository first.
              </p>
            </div>
          </CardContent>
        );
      }

      return (
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Repository</Label>
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={projectTeam.github_repo}
                readOnly
                className="pl-10 pr-10 opacity-75 bg-muted/30"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              Connected repository for <span className="font-medium">{selectedProject.name}</span>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch" className="text-sm font-medium">Branch</Label>
            {projectTeam.github_branches.length > 0 ? (
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger id="branch">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  {projectTeam.github_branches.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">
                No branches found. Try syncing the repository from team settings.
              </p>
            )}
          </div>
        </CardContent>
      );
    }

    // ── Personal project with directly-connected GitHub repo ────────────────
    if (!isTeamMode && selectedProject && !selectedProject.team_id) {
      // Project has no GitHub repo connected
      if (!selectedProject.github_repo) {
        return (
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-8">
              <Github className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                No GitHub repository connected to{" "}
                <span className="font-medium">{selectedProject.name}</span>.
              </p>
              <p className="text-xs text-muted-foreground text-center">
                Connect a repository from the project settings page, then come back to scan.
              </p>
            </div>
          </CardContent>
        );
      }

      // Project has a connected repo — show read-only repo + branch selector
      return (
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Repository</Label>
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={selectedProject.github_repo}
                readOnly
                className="pl-10 pr-10 opacity-75 bg-muted/30"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              Connected repository for{" "}
              <span className="font-medium">{selectedProject.name}</span>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch" className="text-sm font-medium">Branch</Label>
            {selectedProject.github_branches.length > 0 ? (
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger id="branch">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  {selectedProject.github_branches.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">
                No branches found. Try refreshing the repository from project settings.
              </p>
            )}
          </div>
        </CardContent>
      );
    }

    // ── Personal project or no project selected — free-text entry ───────────
    const noProject = !selectedProjectId || selectedProjectId === "__new__";
    return (
      <CardContent className="pt-6 space-y-6">
        {noProject && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Select a team project above to auto-fill the connected repository and branches.
            </p>
          </div>
        )}
        <div className="space-y-2">
          <Label
            htmlFor="repo-url"
            className={cn("text-sm font-medium", noProject && "opacity-40")}
          >
            Repository URL
          </Label>
          <div className="relative">
            <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="repo-url"
              placeholder="https://github.com/username/repository"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={noProject}
              className="pl-10"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="branch"
            className={cn("text-sm font-medium", noProject && "opacity-40")}
          >
            Branch
          </Label>
          <Select value={branch} onValueChange={setBranch} disabled={noProject}>
            <SelectTrigger id="branch">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="main">main</SelectItem>
              <SelectItem value="master">master</SelectItem>
              <SelectItem value="develop">develop</SelectItem>
              <SelectItem value="staging">staging</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    );
  };

  // If scanning or complete, show split-screen view
  if (isScanning || scanComplete) {
    if (autoRescanPreparing) {
      return (
        <DashboardLayout>
          <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
            <div className="flex flex-col items-center gap-4 rounded-lg border border-border/60 bg-card/60 px-10 py-8 text-center shadow-xl">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">Preparing project sources</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Extracting stored C/C++ files for rescan...
                </p>
              </div>
            </div>
          </div>
        </DashboardLayout>
      );
    }

    const firstFile = uploadedFiles[0];
    const displayName = effectiveProjectName
      ? `${effectiveProjectName}${firstFile ? ` · ${firstFile.name}` : ""}`
      : firstFile?.name || "Code Analysis";
    const showSourceLoader =
      isScanning &&
      uploadedFiles.some((file) => file.name.toLowerCase().endsWith(".zip")) &&
      codeLines.length === 1 &&
      !codeLines[0]?.content.trim();

    return (
      <DashboardLayout>
        <div className="h-[calc(100vh-4rem)] -m-4 lg:-m-6 flex flex-col">
          {/* Compact Header with Inline Progress */}
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/50 bg-background h-14 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={handleReset}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 min-w-0">
                <Shield className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium text-sm truncate max-w-[200px]">
                  {displayName}
                </span>
                {isTeamMode && (
                  <span className="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full font-medium shrink-0">
                    Team
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setShowPanel(!showPanel)}
              >
                {showPanel ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeft className="h-4 w-4" />
                )}
              </Button>
              {isScanning && (
                <Button variant="destructive" size="sm" className="h-8" onClick={handleStopScan}>
                  <StopCircle className="h-4 w-4" />
                </Button>
              )}
              {scanComplete && !showPanel && (
                <Button variant="outline" size="sm" className="h-8" onClick={handleReset}>
                  New Scan
                </Button>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* Left Panel - Collapsible */}
            <div 
              className={cn(
                "w-[280px] shrink-0 border-r border-emerald-500/20 bg-[#080d15] flex flex-col transition-all duration-300",
                showPanel ? "translate-x-0" : "-translate-x-full absolute -left-[280px]"
              )}
            >
              <div className="flex-1 overflow-y-auto">
                <ScanningProgress
                  currentPhase={currentPhase}
                  stats={stats}
                  isComplete={scanComplete}
                />
              </div>
              
              {/* Sticky Action Buttons */}
              <div className="p-3 border-t border-emerald-500/15 bg-[#111820]/95 backdrop-blur-sm">
                {scanComplete ? (
                  <Button variant="outline" size="sm" className="w-full" onClick={handleReset}>
                    New Scan
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={handleStopScan}
                  >
                    <StopCircle className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                )}
              </div>
            </div>

            {/* Right Panel - Code Viewer / Report */}
            <div 
              className={cn(
                "flex-1 min-w-0 flex flex-col bg-muted/20 overflow-hidden transition-all duration-300",
                !showPanel && "ml-0"
              )}
            >
              {scanComplete && scanError ? (
                <div className="flex-1 overflow-y-auto p-4 lg:p-6">
                  <div className="mx-auto max-w-3xl">
                    <Card className="bg-card/80 border-destructive/40 p-6">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                        <div className="space-y-2">
                          <h2 className="text-lg font-semibold text-foreground">Analysis could not complete</h2>
                          <p className="text-sm text-muted-foreground">
                            {scanError === ZIP_NO_SOURCE_MESSAGE
                              ? "Upload a ZIP that includes at least one C or C++ source file. Other file types inside the ZIP are ignored automatically."
                              : isRenameFileError(scanError)
                              ? "Rename the flagged file, rebuild the ZIP if needed, and upload it again."
                              : "The security model did not return a valid report, so no analyzer-only findings were shown."}
                          </p>
                          <div className="mt-3 rounded-md bg-background/80 border border-border/50 p-3 text-sm text-foreground">
                            {scanError}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              ) : scanResult ? (
                <div className="flex-1 overflow-y-auto p-4 lg:p-6">
                  <div className="mx-auto grid max-w-7xl gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <Card className="overflow-hidden border-red-500/30 bg-gradient-to-br from-red-500/18 via-card/80 to-card/70 p-4 shadow-lg shadow-red-950/15">
                        <p className="text-xs text-muted-foreground">Risk</p>
                        <p className="mt-1 text-xl font-semibold text-red-100">{scanResult.overall_risk_level}</p>
                      </Card>
                      <Card className="overflow-hidden border-rose-500/30 bg-gradient-to-br from-rose-500/18 via-card/80 to-card/70 p-4 shadow-lg shadow-rose-950/15">
                        <p className="text-xs text-muted-foreground">Vulnerabilities</p>
                        <p className="mt-1 text-xl font-semibold text-rose-100">{scanResult.total_vulnerabilities}</p>
                      </Card>
                      <Card className="overflow-hidden border-cyan-500/30 bg-gradient-to-br from-cyan-500/18 via-card/80 to-card/70 p-4 shadow-lg shadow-cyan-950/15">
                        <p className="text-xs text-muted-foreground">Files</p>
                        <p className="mt-1 text-xl font-semibold text-cyan-100">{scanResult.files_analyzed}</p>
                      </Card>
                      <Card className="overflow-hidden border-violet-500/30 bg-gradient-to-br from-violet-500/18 via-card/80 to-card/70 p-4 shadow-lg shadow-violet-950/15">
                        <p className="text-xs text-muted-foreground">Score</p>
                        <p className="mt-1 text-xl font-semibold text-violet-100">{scanResult.overall_risk_score}</p>
                      </Card>
                    </div>

                    {((streamingChunks.length ? streamingChunks : scanResult.chunk_outputs ?? []).length > 0) && (
                      <Card className="bg-card/70 border-border/50 overflow-hidden">
                        <div className="p-4 border-b border-border/50">
                          <h2 className="text-lg font-semibold text-foreground">
                            {getChunkReportTitle(streamingChunks.length ? streamingChunks : scanResult.chunk_outputs ?? [])}
                          </h2>
                          <p className="text-sm text-muted-foreground mt-1">
                            Expand a chunk to review its code, vulnerabilities, and corrected code.
                          </p>
                        </div>
                        <Accordion type="multiple" className="divide-y divide-border/40">
                          {(streamingChunks.length ? streamingChunks : scanResult.chunk_outputs ?? []).map((chunk) => (
                            <AccordionItem key={`${chunk.file_path}-${chunk.chunk_index}`} value={`${chunk.file_path}-${chunk.chunk_index}`} className="border-0 px-4">
                              <AccordionTrigger className="hover:no-underline">
                                <div className="flex flex-wrap items-center gap-2 text-left">
                                  <Badge variant="outline">{chunk.file_path || chunk.chunk_name || `Chunk ${chunk.chunk_index}`}</Badge>
                                  <span className="font-medium text-foreground">
                                    Lines {chunk.start_line} to {chunk.end_line}
                                  </span>
                                  <Badge variant={chunk.vulnerabilities.length > 0 ? "destructive" : "outline"}>
                                    {chunk.vulnerabilities.length} issue{chunk.vulnerabilities.length === 1 ? "" : "s"}
                                  </Badge>
                                  {isScanning && chunk.corrected_code === "Pending..." && (
                                    <Badge variant="outline" className="animate-pulse border-primary/40 text-primary">
                                      streaming
                                    </Badge>
                                  )}
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="space-y-5 pb-4">
                                  <div>
                                    <p className="text-xs font-medium uppercase text-muted-foreground">Input code</p>
                                    <NumberedCodeBlock
                                      code={chunk.code}
                                      startLine={chunk.start_line}
                                      emptyText="No input code returned."
                                    />
                                  </div>

                                  <div className="space-y-3">
                                    <p className="text-xs font-medium uppercase text-muted-foreground">Vulnerabilities</p>
                                    {chunk.vulnerabilities.length === 0 ? (
                                      <p className="rounded-md border border-border/50 bg-background/60 p-3 text-sm text-muted-foreground">
                                        No vulnerabilities were reported in this chunk.
                                      </p>
                                    ) : (
                                      chunk.vulnerabilities.map((vulnerability, index) => (
                                        <div key={`${chunk.chunk_index}-${vulnerability.cwe_id}-${index}`} className="rounded-md border border-border/50 bg-background/70 p-4">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className={cn(
                                              vulnerability.severity === "Critical" && "bg-red-500/15 text-red-300 border-red-500/30",
                                              vulnerability.severity === "High" && "bg-orange-500/15 text-orange-300 border-orange-500/30",
                                              vulnerability.severity === "Medium" && "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
                                              vulnerability.severity === "Low" && "bg-blue-500/15 text-blue-300 border-blue-500/30"
                                            )}>
                                              {vulnerability.severity}
                                            </Badge>
                                            <span className="font-semibold text-foreground">{vulnerability.cwe_id}</span>
                                            {vulnerability.line_number > 0 && (
                                              <span className="text-xs text-muted-foreground">line {vulnerability.line_number}</span>
                                            )}
                                          </div>
                                          <NumberedCodeBlock
                                            code={codeForVulnerability(chunk, vulnerability)}
                                            startLine={vulnerability.line_number || vulnerability.absolute_line || chunk.start_line}
                                          />
                                          <p className="mt-3 text-sm text-foreground">{vulnerability.description}</p>
                                        </div>
                                      ))
                                    )}
                                  </div>

                                  <div>
                                    <p className="text-xs font-medium uppercase text-muted-foreground">Corrected code</p>
                                    <NumberedCodeBlock
                                      code={chunk.corrected_code && chunk.corrected_code !== "None" ? chunk.corrected_code : ""}
                                      startLine={chunk.start_line}
                                      emptyText="Waiting for corrected code..."
                                    />
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </Card>
                    )}

                    <div className="hidden grid-cols-1 gap-5">
                      <Card className="bg-card/70 border-border/50 overflow-hidden">
                        <div className="p-4 border-b border-border/50">
                          <h2 className="text-lg font-semibold text-foreground">Vulnerability Report</h2>
                          <p className="text-sm text-muted-foreground mt-1">
                            Each issue shows the exact line, affected code, problem, and fix.
                          </p>
                        </div>
                        <div className="divide-y divide-border/40">
                          {scanResult.vulnerabilities.length === 0 ? (
                            <div className="p-6 text-sm text-muted-foreground">No vulnerabilities were reported by the model.</div>
                          ) : (
                            scanResult.vulnerabilities.map((vulnerability, index) => (
                              <button
                                key={`${vulnerability.file_path}-${vulnerability.cwe_id}-${index}`}
                                className={cn(
                                  "w-full text-left p-5 hover:bg-muted/30 transition-colors",
                                  selectedVulnerability === vulnerability && "bg-primary/10"
                                )}
                                onClick={() => setSelectedVulnerability(vulnerability)}
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-foreground">Issue {index + 1}</span>
                                  <Badge variant="outline" className={cn(
                                    vulnerability.severity === "Critical" && "bg-red-500/15 text-red-300 border-red-500/30",
                                    vulnerability.severity === "High" && "bg-orange-500/15 text-orange-300 border-orange-500/30",
                                    vulnerability.severity === "Medium" && "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
                                    vulnerability.severity === "Low" && "bg-blue-500/15 text-blue-300 border-blue-500/30"
                                  )}>
                                    {vulnerability.severity}
                                  </Badge>
                                  <span className="font-semibold text-foreground">{vulnerability.cwe_id}</span>
                                  <span className="text-sm text-muted-foreground">{vulnerability.cwe_name}</span>
                                </div>
                                <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                                  <div>
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Line</p>
                                    <p className="mt-1 text-sm font-medium text-foreground">
                                      {vulnerability.file_path}
                                      {vulnerability.line_number ? `, line ${vulnerability.line_number}` : ""}
                                    </p>
                                    {vulnerability.location && (
                                      <p className="mt-1 text-xs text-muted-foreground">{vulnerability.location}</p>
                                    )}
                                  </div>

                                  <div className="space-y-4">
                                    <div>
                                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Code at this line</p>
                                      <NumberedCodeBlock
                                        code={vulnerability.affected_code || `Line ${vulnerability.line_number || vulnerability.absolute_line || "N/A"}`}
                                        startLine={vulnerability.line_number || vulnerability.absolute_line || 1}
                                      />
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What is vulnerable here</p>
                                      <p className="mt-1 text-sm text-foreground">{vulnerability.description}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended fix</p>
                                      <p className="mt-1 text-sm text-foreground">{vulnerability.fix_suggestion}</p>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </Card>

                      <Card className="hidden">
                        <h3 className="font-semibold text-foreground">Finding Details</h3>
                        {selectedVulnerability ? (
                          <>
                            <div>
                              <p className="text-xs text-muted-foreground">Location</p>
                              <p className="text-sm text-foreground mt-1">
                                {selectedVulnerability.file_path}
                                {selectedVulnerability.location ? ` — ${selectedVulnerability.location}` : ""}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Affected Code</p>
                              <NumberedCodeBlock
                                code={selectedVulnerability.affected_code || `Line ${selectedVulnerability.line_number || selectedVulnerability.absolute_line || "N/A"}`}
                                startLine={selectedVulnerability.line_number || selectedVulnerability.absolute_line || 1}
                              />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Remediation</p>
                              <p className="text-sm text-foreground mt-1">{selectedVulnerability.fix_suggestion}</p>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">Select a vulnerability from the report.</p>
                        )}
                      </Card>
                    </div>

                    <Card className="hidden bg-card/70 border-border/50 overflow-hidden">
                      <div className="p-4 border-b border-border/50">
                        <h2 className="text-lg font-semibold text-foreground">Corrected Code</h2>
                        <p className="text-sm text-muted-foreground mt-1">Model-generated secure version.</p>
                      </div>
                      <div className="divide-y divide-border/40 bg-background/70">
                        {(scanResult.files?.length ? scanResult.files : [{ filename: "corrected-code", language: "", corrected_code: scanResult.corrected_code }]).map((file, index) => (
                          <section key={`${file.filename}-${index}`}>
                            <div className="flex items-center justify-between px-4 py-2 bg-background/80">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                {file.filename}
                              </span>
                              {file.language && (
                                <Badge variant="outline" className="text-[10px]">
                                  {file.language}
                                </Badge>
                              )}
                            </div>
                            <NumberedCodeBlock
                              code={file.corrected_code && file.corrected_code !== "None" ? file.corrected_code : ""}
                              emptyText="No corrected code was returned."
                            />
                          </section>
                        ))}
                      </div>
                    </Card>
                    </div>
                    <Card className="bg-card/70 border-border/60 overflow-hidden h-fit xl:sticky xl:top-4">
                      <div className="p-4 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <h2 className="text-base font-semibold text-foreground">Thinking</h2>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Live node stream and model progress.</p>
                      </div>
                      <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-4">
                        {renderThinkingStream("No thinking events were recorded.")}
                      </div>
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="flex-1 p-4 lg:p-6 overflow-hidden">
                  <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    {showSourceLoader ? (
                      <div className="grid h-full place-items-center rounded-lg border border-border/30 bg-[#0d1117]">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      </div>
                    ) : (
                      <CodeViewer
                        lines={codeLines}
                        currentLine={currentLine}
                        language={firstFile ? scanLang : "c"}
                      />
                    )}
                    <Card className="bg-card/70 border-border/60 overflow-hidden h-full">
                      <div className="p-4 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <Boxes className="h-4 w-4 text-primary" />
                          <h2 className="text-base font-semibold text-foreground">Thinking</h2>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Processing semantic chunks one at a time.</p>
                      </div>
                      <div className="p-4 overflow-y-auto max-h-full">
                        {renderThinkingStream("Waiting for analysis to start.")}
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Pre-scan UI
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-background to-background border border-primary/20 p-8">
          <div className="absolute inset-0 bg-grid-pattern opacity-5" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-primary/20">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                New Security Scan
              </h1>
            </div>
            <p className="text-muted-foreground max-w-lg">
              Upload your C or C++ code to detect vulnerabilities, 
              security flaws, and potential exploits using AI-powered analysis.
            </p>
          </div>
        </div>

        {/* ── Scan Mode Toggle ─────────────────────────────────────────── */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="pt-6 space-y-4">
            {/* Personal / Team toggle */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border/50 w-fit">
              <Button
                size="sm"
                variant={scanMode === "personal" ? "default" : "ghost"}
                className="h-8 px-4 text-xs font-medium"
                onClick={() => {
                  setScanMode("personal");
                }}
              >
                Personal Scan
              </Button>
              <Button
                size="sm"
                variant={scanMode === "team" ? "default" : "ghost"}
                className="h-8 px-4 text-xs font-medium"
                onClick={() => {
                  if (allTeams.length === 0) {
                    toast.error("No Teams Found", {
                      description: "You must be a member of a team to perform a team scan.",
                    });
                    return;
                  }
                  setScanMode("team");
                }}
              >
                Team Scan
              </Button>
            </div>

            {/* ── TEAM MODE: team selector + role gate ─────────────────── */}
            {scanMode === "team" && (
              <div className="space-y-3 mb-4">
                <Label className="text-sm font-medium">
                  Team <span className="text-destructive">*</span>
                </Label>
                <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {allTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        <span className="flex items-center gap-2">
                          {team.current_user_role === "admin" && (
                            <Crown className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                          )}
                          {team.current_user_role === "viewer" && (
                            <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="truncate">{team.name}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0 h-4 capitalize ml-1",
                              team.current_user_role === "admin" && "bg-primary/20 text-primary border-primary/30",
                              team.current_user_role === "developer" && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                              team.current_user_role === "viewer" && "bg-muted text-muted-foreground border-border"
                            )}
                          >
                            {team.current_user_role}
                          </Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Viewer blocked message */}
                {isViewer && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <Eye className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-400">
                        View-only access
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        You have Viewer access in this team and cannot initiate scans.
                        Contact your team Admin to upgrade your role to Developer or Admin.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── PROJECT SELECTOR (Both Modes) ──────────────────────── */}
            {(scanMode === "personal" || (scanMode === "team" && canScanInTeam)) && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Project <span className="text-destructive">*</span>
                </Label>
                <Popover open={projectDropdownOpen} onOpenChange={setProjectDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={projectDropdownOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedProjectId
                        ? selectedProjectId === "__new__"
                          ? "Create new project"
                          : projects.find((project) => project.id === selectedProjectId)?.name
                        : "Select or create a project"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput 
                        placeholder="Search projects..." 
                        value={projectSearch}
                        onValueChange={setProjectSearch}
                      />
                      <CommandList>
                        <CommandEmpty>No project found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="__new__"
                            onSelect={() => {
                              setSelectedProjectId("__new__");
                              setSelectedProjectName("");
                              setIsCreatingProject(true);
                              setProjectDropdownOpen(false);
                              setProjectSearch("");
                            }}
                          >
                            <div className="flex items-center gap-2 text-primary w-full">
                              <Plus className="h-3.5 w-3.5" />
                              <span>Create new project</span>
                              {selectedProjectId === "__new__" && (
                                <Check className="ml-auto h-4 w-4" />
                              )}
                            </div>
                          </CommandItem>
                          {projects
                            .filter((p) => scanMode === "personal" ? p.type === "personal" : (p.type === "team" && p.team_id === selectedTeamId))
                            .filter((p) => p.name.toLowerCase().includes(projectSearch.toLowerCase()))
                            .slice(0, 5)
                            .map((p) => (
                              <CommandItem
                                key={p.id}
                                value={p.name}
                                onSelect={() => {
                                  setSelectedProjectId(p.id);
                                  setSelectedProjectName(p.name);
                                  setIsCreatingProject(false);
                                  setBranch("main");
                                  setProjectDropdownOpen(false);
                                  setProjectSearch("");
                                }}
                              >
                                {p.name}
                                {selectedProjectId === p.id && (
                                  <Check className="ml-auto h-4 w-4" />
                                )}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Inline new project name input */}
                {selectedProjectId === "__new__" && (
                  <div className="space-y-1.5">
                    <Input
                      placeholder="Enter new project name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      autoFocus
                    />
                    {detectedProjectLanguage && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        Project will be created as
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0 rounded-full border font-medium",
                            detectedProjectLanguage === "C"
                              ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                              : "bg-pink-500/20 text-pink-400 border-pink-500/30"
                          )}
                        >
                          {detectedProjectLanguage}
                        </span>
                        based on your uploaded file.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Source Selection Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="upload" className="gap-2 text-sm font-medium">
              <Upload className="h-4 w-4" />
              Upload File
            </TabsTrigger>
            <TabsTrigger value="github" className="gap-2 text-sm font-medium">
              <Github className="h-4 w-4" />
              Import from GitHub
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="mt-6">
            {/* ── Existing Project Files (real project selected) ── */}
            {selectedProjectId &&
              selectedProjectId !== "__new__" && (
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm mb-4">
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-foreground">
                        Existing Files
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => fetchProjectFiles(selectedProjectId)}
                        disabled={projectFilesLoading}
                        title="Refresh files"
                      >
                        <RefreshCw
                          className={cn(
                            "h-3.5 w-3.5",
                            projectFilesLoading && "animate-spin"
                          )}
                        />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {projectFilesError && (
                      <p className="text-xs text-destructive mb-2">
                        {projectFilesError}
                      </p>
                    )}
                    {projectFilesLoading && projectFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        Loading files…
                      </p>
                    ) : projectFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        No files in this project yet.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {/* Select All header */}
                        <div className="flex items-center gap-3 px-2 py-1.5 rounded-md bg-muted/30 border border-border/40 mb-2">
                          <Checkbox
                            id="select-all-files"
                            checked={
                              projectFiles.length > 0 &&
                              projectFiles.every((f) => selectedFileIds.has(f.id))
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedFileIds(
                                  new Set(projectFiles.map((f) => f.id))
                                );
                              } else {
                                setSelectedFileIds(new Set());
                              }
                            }}
                          />
                          <label
                            htmlFor="select-all-files"
                            className="text-xs font-medium text-muted-foreground cursor-pointer select-none flex-1"
                          >
                            Select All
                          </label>
                          <span className="text-xs text-muted-foreground">
                            {selectedFileIds.size}/{projectFiles.length} selected
                          </span>
                        </div>

                        {/* File rows */}
                        {projectFiles.map((file) => (
                          <div
                            key={file.id}
                            className={cn(
                              "flex items-center gap-3 px-2 py-2 rounded-md border transition-colors cursor-pointer",
                              selectedFileIds.has(file.id)
                                ? "bg-primary/5 border-primary/20"
                                : "bg-transparent border-border/30 hover:bg-muted/20"
                            )}
                            onClick={() => {
                              setSelectedFileIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(file.id)) {
                                  next.delete(file.id);
                                } else {
                                  next.add(file.id);
                                }
                                return next;
                              });
                            }}
                          >
                            <Checkbox
                              checked={selectedFileIds.has(file.id)}
                              onCheckedChange={(checked) => {
                                setSelectedFileIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) {
                                    next.add(file.id);
                                  } else {
                                    next.delete(file.id);
                                  }
                                  return next;
                                });
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
                              {file.name}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
                              {formatFileSize(file.size)}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0 w-24 text-right">
                              {formatRelativeTime(file.uploaded_at)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

            {/* ── Upload New File ─────────────────────────────────────────── */}
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardContent className="pt-6">
                {/* Language lock notice */}
                {effectiveLanguage && (
                  <div className="flex items-center gap-2 mb-4 px-1">
                    <span className="text-xs text-muted-foreground">
                      Language locked to
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                        effectiveLanguage === "C"
                          ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                          : "bg-pink-500/20 text-pink-400 border-pink-500/30"
                      )}
                    >
                      {effectiveLanguage}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      — only {acceptedExtensions} files accepted
                    </span>
                  </div>
                )}
                <FileUploadArea
                  uploadedFiles={uploadedFiles}
                  isDragOver={isDragOver}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onFileSelect={handleFileSelect}
                  onRemoveFile={handleRemoveFile}
                  lockedLanguage={effectiveLanguage}
                />

                {/* "Save to project" toggles — show whenever a project is selected or being created */}
                {false && selectedProjectId &&
                  uploadedFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {uploadedFiles.map((file, index) => {
                        const badge = getFileLangBadge(file.name);
                        return (
                          <div
                            key={`save-${file.name}-${index}`}
                            className="flex items-center gap-2 px-1"
                          >
                            <Checkbox
                              id={`save-to-project-${index}`}
                              checked={saveToProject[index] !== false}
                              onCheckedChange={(checked) =>
                                setSaveToProject((prev) => ({
                                  ...prev,
                                  [index]: !!checked,
                                }))
                              }
                            />
                            <label
                              htmlFor={`save-to-project-${index}`}
                              className="text-xs text-muted-foreground cursor-pointer select-none flex items-center gap-1.5"
                            >
                              Save{" "}
                              <span className="font-medium text-foreground">
                                {file.name}
                              </span>
                              {badge && (
                                <span
                                  className={cn(
                                    "text-[10px] px-1.5 py-0 rounded-full border font-medium",
                                    badge.className
                                  )}
                                >
                                  {badge.label}
                                </span>
                              )}
                              {" "}to project
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* GitHub Tab */}
          <TabsContent value="github" className="mt-6">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              {renderGitHubTab()}
            </Card>
          </TabsContent>
        </Tabs>

        {/* Start Analysis Button */}
        <Button 
          size="lg" 
          className="w-full h-14 text-lg font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all"
          onClick={handleStartScan}
          disabled={!canStartScan}
        >
          <Play className="h-5 w-5 mr-2" />
          Start Security Analysis
        </Button>
      </div>
    </DashboardLayout>
  );
};

export default NewScan;
