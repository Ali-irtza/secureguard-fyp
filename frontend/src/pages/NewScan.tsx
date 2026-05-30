import { useState, useEffect, useCallback, useRef } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { triggerScan, getBranchFiles, ScanResult } from "@/lib/scans-api";
import { listProjects, createProject, Project } from "@/lib/projects-api";
import { getTeam, listTeams } from "@/lib/teams-api";
import type { Team as ApiTeam } from "@/lib/teams-api";
import {
  listProjectFiles,
  uploadProjectFile,
  formatFileSize,
  formatRelativeTime,
  type ProjectFileResponse,
} from "@/lib/project-files-api";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Upload,
  Github,
  Settings2,
  ChevronDown,
  Play,
  Sparkles,
  KeyRound,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeViewer } from "@/components/scan/CodeViewer";
import { ScanningProgress } from "@/components/scan/ScanningProgress";
import { ScanLogTerminal, LogEntry } from "@/components/scan/ScanLogTerminal";
import { FileUploadArea } from "@/components/scan/FileUploadArea";
import { toast } from "sonner";

// Mock code samples for different languages
const MOCK_CODE = {
  c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void vulnerable_function(char *input) {
    char buffer[64];
    // Buffer overflow vulnerability
    strcpy(buffer, input);
    printf("Input: %s\\n", buffer);
}

int check_password(char *password) {
    // Hardcoded password
    if (strcmp(password, "secret123") == 0) {
        return 1;
    }
    return 0;
}

void format_string_vuln(char *user_input) {
    // Format string vulnerability
    printf(user_input);
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        printf("Usage: %s <input>\\n", argv[0]);
        return 1;
    }
    
    vulnerable_function(argv[1]);
    
    char password[100];
    printf("Enter password: ");
    gets(password); // Dangerous function
    
    if (check_password(password)) {
        printf("Access granted\\n");
    }
    
    return 0;
}`,
  cpp: `#include <iostream>
#include <cstring>
#include <fstream>

using namespace std;

class UserAuth {
private:
    char username[50];
    char password[50];
    
public:
    void setCredentials(const char* user, const char* pass) {
        // Buffer overflow potential
        strcpy(username, user);
        strcpy(password, pass);
    }
    
    bool authenticate(const char* pass) {
        // Timing attack vulnerability
        return strcmp(password, pass) == 0;
    }
};

void readFile(const char* filename) {
    // Path traversal vulnerability
    ifstream file(filename);
    string line;
    while (getline(file, line)) {
        cout << line << endl;
    }
}

int* createArray(int size) {
    // Memory leak - no delete
    int* arr = new int[size];
    return arr;
}

int main() {
    UserAuth auth;
    auth.setCredentials("admin", "admin123");
    
    char input[256];
    cout << "Enter filename: ";
    cin >> input;
    
    // No input validation
    readFile(input);
    
    return 0;
}`
};

// Vulnerability patterns for simulation
const VULNERABILITY_PATTERNS = [
  { line: 7, message: "Buffer Overflow", lang: "c" },
  { line: 12, message: "Hardcoded Password", lang: "c" },
  { line: 18, message: "Format String Vuln", lang: "c" },
  { line: 29, message: "Dangerous Function", lang: "c" },
  { line: 14, message: "Buffer Overflow", lang: "cpp" },
  { line: 19, message: "Timing Attack", lang: "cpp" },
  { line: 25, message: "Path Traversal", lang: "cpp" },
  { line: 32, message: "Memory Leak", lang: "cpp" },
];

interface CodeLine {
  lineNumber: number;
  content: string;
  status: "pending" | "scanning" | "safe" | "vulnerable";
  vulnerability?: string;
}

const NewScan = () => {
  const [activeTab, setActiveTab] = useState("upload");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [fileContent, setFileContent] = useState<string>("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [language, setLanguage] = useState("auto");
  const [deepAnalysis, setDeepAnalysis] = useState(true);
  const [checkSecrets, setCheckSecrets] = useState(true);
  
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
  // Set of file IDs that are checked for scanning
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  // Per-uploaded-file "save to project" toggle: index → boolean
  const [saveToProject, setSaveToProject] = useState<Record<number, boolean>>({});

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

  // Selected team in team mode (real API team)
  const selectedApiTeam: ApiTeam | null = allTeams.find((t) => t.id === selectedTeamId) ?? null;
  const userTeamRole = selectedApiTeam?.current_user_role ?? null;
  const isViewer = userTeamRole === "viewer";
  const canScanInTeam = userTeamRole === "admin" || userTeamRole === "developer";
  const isTeamMode = scanMode === "team";
  
  // Scanning state
  const [currentPhase, setCurrentPhase] = useState(0);
  const [currentLine, setCurrentLine] = useState(0);
  const [codeLines, setCodeLines] = useState<CodeLine[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [stats, setStats] = useState({
    linesScanned: 0,
    totalLines: 0,
    vulnerabilitiesFound: 0,
    elapsedTime: 0,
  });
  
  // Abort ref for stopping scan
  const scanAbortRef = useRef(false);

  // New scan result state
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [branchFiles, setBranchFiles] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string>("");

  // Panel visibility state
  const [showPanel, setShowPanel] = useState(true);

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
          const ext = uploadedFiles[0].name.split(".").pop()?.toLowerCase() ?? "";
          if (ext === "c" || ext === "h") return "C";
          if (["cpp", "cc", "cxx", "hpp", "hxx"].includes(ext)) return "C++";
          return null;
        })();

  // Accepted extensions for the file input — locked once first file is uploaded
  const acceptedExtensions =
    detectedProjectLanguage === "C"
      ? ".c,.h"
      : detectedProjectLanguage === "C++"
      ? ".cpp,.cxx,.cc,.hpp,.hxx,.h"
      : ".c,.h,.cpp,.cxx,.cc,.hpp,.hxx,.h";

  /** Returns true if a file is compatible with the already-detected language */
  const isCompatibleFile = (file: File): boolean => {
    if (!detectedProjectLanguage) return true; // no constraint yet
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    if (detectedProjectLanguage === "C") return [".c", ".h"].includes(ext);
    if (detectedProjectLanguage === "C++")
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
  const scanLang = detectedProjectLanguage === "C++" ? "cpp" : "c";

  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    const now = new Date();
    const timestamp = `${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    setLogs((prev) => [...prev, { timestamp, message, type }]);
  }, []);

  const handleStopScan = () => {
    scanAbortRef.current = true;
    setIsScanning(false);
    addLog("Scan cancelled by user", "warning");
  };

  const handleStartScan = async () => {
    scanAbortRef.current = false;
    setIsScanning(true);
    setScanComplete(false);
    setScanResult(null);
    setScanError("");
    setCurrentPhase(0);
    setCurrentLine(0);
    setLogs([]);

    // Resolve project id/name — create new project if needed
    let resolvedProjectId = selectedProjectId;
    let resolvedProjectName = selectedProjectName || projectName;

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
      if (resolvedProjectId && resolvedProjectId !== "__new__") {
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
      if (projectFiles.length > 0 && selectedFileIds.size > 0) {
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
        const text = await file.text();
        filesToScan.push({ name: file.name, content: text });
      }

      // Fallback to mock code if nothing collected
      if (filesToScan.length === 0) {
        filesToScan.push({
          name: firstFile?.name || "uploaded_file.c",
          content: MOCK_CODE[scanLang as keyof typeof MOCK_CODE] || MOCK_CODE.c,
        });
      }

      // Use the first file for the code viewer animation
      const primaryFile = filesToScan[0];
      const code = primaryFile.content;
      const lines = code.split("\n");

      const initialLines: CodeLine[] = lines.map((content, index) => ({
        lineNumber: index + 1,
        content,
        status: "pending" as const,
      }));
      setCodeLines(initialLines);
      setStats({ linesScanned: 0, totalLines: lines.length, vulnerabilitiesFound: 0, elapsedTime: 0 });

      addLog("Initializing SecureGuard AI Scanner...", "info");
      setCurrentPhase(1);
      addLog("Parsing source code and building AST...", "info");
      await new Promise(r => setTimeout(r, 600));
      setCurrentPhase(2);
      addLog(`Sending ${filesToScan.length} file${filesToScan.length > 1 ? "s" : ""} to AI vulnerability engine...`, "info");

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
        const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
        const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

        // Scan all files sequentially; accumulate results
        let combinedResult: ScanResult | null = null;

        for (const fileTuple of filesToScan) {
          if (scanAbortRef.current) break;

          const response = await fetch(`${API_BASE}/scan/upload`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
              filename: fileTuple.name,
              source_code: fileTuple.content,
              project_id: resolvedProjectId ?? "",
              project_name: resolvedProjectName ?? "",
            }),
          });

          if (!response.ok) throw new Error(`Scan failed: ${response.status}`);
          const result: ScanResult = await response.json();

          if (!combinedResult) {
            combinedResult = result;
          } else {
            // Merge results
            combinedResult = {
              ...combinedResult,
              total_vulnerabilities: combinedResult.total_vulnerabilities + result.total_vulnerabilities,
              files_analyzed: combinedResult.files_analyzed + result.files_analyzed,
              total_chunks_scanned: combinedResult.total_chunks_scanned + result.total_chunks_scanned,
              files_summary: [...combinedResult.files_summary, ...result.files_summary],
              vulnerabilities: [...combinedResult.vulnerabilities, ...result.vulnerabilities],
              overall_risk_level:
                ["Critical", "High", "Medium", "Low"].indexOf(result.overall_risk_level) <
                ["Critical", "High", "Medium", "Low"].indexOf(combinedResult.overall_risk_level)
                  ? result.overall_risk_level
                  : combinedResult.overall_risk_level,
            };
          }
        }

        clearInterval(lineAnimInterval);
        clearInterval(timerInterval);

        if (!combinedResult) throw new Error("No scan results returned");

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
        setCurrentPhase(3);
        addLog("Deep analysis complete", "success");
        setCurrentPhase(4);
        addLog("Generating report...", "info");
        await new Promise(r => setTimeout(r, 500));
        setCurrentPhase(5);
        addLog(`Found ${combinedResult.total_vulnerabilities} vulnerabilities — Risk: ${combinedResult.overall_risk_level}`, combinedResult.total_vulnerabilities > 0 ? "warning" : "success");
        addLog("Scan complete!", "success");

      } catch (err: any) {
        clearInterval(lineAnimInterval);
        clearInterval(timerInterval);
        setScanError(err.message || "Scan failed");
        addLog(`Error: ${err.message}`, "warning");
      }

      setIsScanning(false);
      setScanComplete(true);
      return;
    }

    // ── GITHUB MODE ──────────────────────────────────────────────────────────
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

      try {
        addLog("Initializing SecureGuard AI Scanner...", "info");
        setCurrentPhase(1);

        addLog(`Fetching C/C++ files from branch: ${branch}...`, "info");
        const files = await getBranchFiles(effectiveTeamId, branch);
        setBranchFiles(files);
        addLog(`Found ${files.length} C/C++ files`, "success");

        setCurrentPhase(2);
        addLog("Sending files to AI vulnerability engine...", "info");
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
        setCurrentPhase(3);
        addLog("Deep analysis complete", "success");
        setCurrentPhase(4);
        addLog("Generating report...", "info");
        await new Promise(r => setTimeout(r, 500));
        setCurrentPhase(5);
        addLog(`Found ${result.total_vulnerabilities} vulnerabilities — Risk: ${result.overall_risk_level}`, result.total_vulnerabilities > 0 ? "warning" : "success");
        addLog("Scan complete!", "success");

      } catch (err: any) {
        clearInterval(timerInterval);
        setScanError(err.message || "Scan failed");
        addLog(`Error: ${err.message}`, "warning");
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
          description: `This project uses ${detectedProjectLanguage}. Only ${acceptedExtensions} files are allowed.`,
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
          description: `This project uses ${detectedProjectLanguage}. Only ${acceptedExtensions} files are allowed.`,
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
    setLogs([]);
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
  // or a manual repo URL is entered (personal mode with personal project).
  const githubReady = isTeamMode
    ? !!(selectedApiTeam?.github_repo && branch)
    : selectedProject?.team_id
      ? !!(projectTeam?.github_repo && branch)
      : !!repoUrl;

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
      ? !!(selectedTeamId && canScanInTeam) && (activeTab === "upload" ? uploadedFiles.length > 0 : githubReady)
      : effectiveProjectName !== "" && (activeTab === "upload" ? hasFilesToScan : githubReady)
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
            {selectedApiTeam.github_branches.length > 0 ? (
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger id="branch">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  {selectedApiTeam.github_branches.map((b) => (
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
    const progressPercentage = stats.totalLines > 0 
      ? Math.round((stats.linesScanned / stats.totalLines) * 100) 
      : 0;

    const firstFile = uploadedFiles[0];
    const displayName = effectiveProjectName
      ? `${effectiveProjectName}${firstFile ? ` · ${firstFile.name}` : ""}`
      : firstFile?.name || "Code Analysis";

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
              {/* Inline Progress */}
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300" 
                    style={{ width: `${progressPercentage}%` }} 
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-8">
                  {progressPercentage}%
                </span>
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
                <>
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      if (scanResult) {
                        console.log("Scan Results:", JSON.stringify(scanResult, null, 2));
                        alert(`Scan Complete!\n\nRisk Level: ${scanResult.overall_risk_level}\nVulnerabilities: ${scanResult.total_vulnerabilities}\nFiles Scanned: ${scanResult.files_analyzed}`);
                      }
                    }}
                  >
                    View Report
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={handleReset}>
                    New Scan
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* Left Panel - Collapsible */}
            <div 
              className={cn(
                "w-[280px] shrink-0 border-r border-border/50 bg-card/30 flex flex-col transition-all duration-300",
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
              
              {/* Terminal Logs */}
              <div className="p-3 border-t border-border/50">
                <ScanLogTerminal
                  logs={logs}
                  isExpanded={logsExpanded}
                  onToggleExpand={() => setLogsExpanded(!logsExpanded)}
                />
              </div>

              {/* Sticky Action Buttons */}
              <div className="p-3 border-t border-border/50 bg-card/80 backdrop-blur-sm">
                {scanComplete ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 shadow-lg shadow-primary/25"
                      onClick={() => {
                        if (scanResult) {
                          console.log("Scan Results:", JSON.stringify(scanResult, null, 2));
                          alert(`Scan Complete!\n\nRisk Level: ${scanResult.overall_risk_level}\nVulnerabilities: ${scanResult.total_vulnerabilities}\nFiles Scanned: ${scanResult.files_analyzed}`);
                        }
                      }}
                    >
                      View Report
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={handleReset}>
                      New Scan
                    </Button>
                  </div>
                ) : (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="w-full" 
                    onClick={handleStopScan}
                  >
                    <StopCircle className="h-4 w-4 mr-2" />
                    Stop Scan
                  </Button>
                )}
              </div>
            </div>

            {/* Right Panel - Code Viewer (Constrained Width, Centered) */}
            <div 
              className={cn(
                "flex-1 min-w-0 flex flex-col bg-muted/20 overflow-hidden transition-all duration-300",
                !showPanel && "ml-0"
              )}
            >
              <div className="flex-1 p-4 lg:p-6 overflow-hidden flex justify-center">
                <div className="w-full max-w-4xl h-full">
                  <CodeViewer
                    lines={codeLines}
                    currentLine={currentLine}
                    language={firstFile ? scanLang : "c"}
                  />
                </div>
              </div>
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
                  if (activeTab === "github") setActiveTab("upload");
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
          {scanMode === "team" && (
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
          )}

          {/* Upload Tab */}
          <TabsContent value="upload" className={cn(scanMode === "team" ? "mt-6" : "mt-0")}>
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
                {detectedProjectLanguage && (
                  <div className="flex items-center gap-2 mb-4 px-1">
                    <span className="text-xs text-muted-foreground">
                      Language locked to
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                        detectedProjectLanguage === "C"
                          ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                          : "bg-pink-500/20 text-pink-400 border-pink-500/30"
                      )}
                    >
                      {detectedProjectLanguage}
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
                />

                {/* "Save to project" toggles — show whenever a project is selected or being created */}
                {selectedProjectId &&
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

        {/* Advanced Configuration */}
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5 text-muted-foreground" />
                    Advanced Configuration
                  </div>
                  <ChevronDown className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform duration-200",
                    settingsOpen && "rotate-180"
                  )} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-6">
                {/* Language Selection */}
                <div className="space-y-2">
                  <Label htmlFor="language" className="text-sm font-medium">
                    Language
                  </Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger id="language">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="c">C</SelectItem>
                      <SelectItem value="cpp">C++</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Toggles */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <Label htmlFor="deep-analysis" className="text-sm font-medium cursor-pointer">
                          Deep AI Analysis
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Use advanced AI to detect complex vulnerabilities
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="deep-analysis"
                      checked={deepAnalysis}
                      onCheckedChange={setDeepAnalysis}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-warning/10">
                        <KeyRound className="h-4 w-4 text-warning" />
                      </div>
                      <div>
                        <Label htmlFor="check-secrets" className="text-sm font-medium cursor-pointer">
                          Check for Secrets/Keys
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Scan for exposed API keys, passwords, and tokens
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="check-secrets"
                      checked={checkSecrets}
                      onCheckedChange={setCheckSecrets}
                    />
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

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
