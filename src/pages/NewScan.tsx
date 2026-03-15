import { useState, useEffect, useCallback, useRef } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeViewer } from "@/components/scan/CodeViewer";
import { ScanningProgress } from "@/components/scan/ScanningProgress";
import { ScanLogTerminal, LogEntry } from "@/components/scan/ScanLogTerminal";
import { FileUploadArea } from "@/components/scan/FileUploadArea";
import ScanModeToggle from "@/components/scan/ScanModeToggle";
import { mockTeams, CURRENT_USER_ID } from "@/lib/team-data";

// Mock code samples for different languages
const MOCK_CODE = {
  python: `import os
import sqlite3
from flask import Flask, request

app = Flask(__name__)

def get_user(user_id):
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    # SQL Injection vulnerability
    query = f"SELECT * FROM users WHERE id = {user_id}"
    cursor.execute(query)
    return cursor.fetchone()

@app.route('/login', methods=['POST'])
def login():
    username = request.form['username']
    password = request.form['password']
    
    # Hardcoded credentials
    if username == 'admin' and password == 'password123':
        return 'Login successful'
    
    return 'Invalid credentials'

@app.route('/exec', methods=['POST'])
def execute():
    # Command injection vulnerability
    cmd = request.form['cmd']
    os.system(cmd)
    return 'Executed'

if __name__ == '__main__':
    app.run(debug=True)`,
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
  { line: 11, message: "SQL Injection", lang: "python" },
  { line: 18, message: "Hardcoded Credentials", lang: "python" },
  { line: 26, message: "Command Injection", lang: "python" },
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

  // Panel visibility state
  const [showPanel, setShowPanel] = useState(true);

  // Initialize default team selection
  useEffect(() => {
    const scanableTeams = mockTeams.filter(
      (t) => t.currentUserRole === "admin" || t.currentUserRole === "developer"
    );
    const adminTeam = scanableTeams.find((t) => t.currentUserRole === "admin");
    setSelectedTeamId((adminTeam || scanableTeams[0])?.id || "");
  }, []);

  // Derived values
  const selectedTeam = mockTeams.find((t) => t.id === selectedTeamId);
  const userRole = selectedTeam?.currentUserRole;
  const isTeamMode = scanMode === "team" && selectedTeam;

  // Pre-fill repo URL when in team mode
  useEffect(() => {
    if (isTeamMode && selectedTeam?.githubRepo) {
      setRepoUrl(selectedTeam.githubRepo);
    } else if (!isTeamMode) {
      setRepoUrl("");
    }
  }, [isTeamMode, selectedTeam]);

  // Pre-fill branch for developer
  useEffect(() => {
    if (isTeamMode && userRole === "developer") {
      const member = selectedTeam?.members.find((m) => m.id === CURRENT_USER_ID);
      if (member?.branch) {
        setBranch(member.branch);
      }
    }
  }, [isTeamMode, userRole, selectedTeam]);

  const detectLanguage = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "py") return "python";
    if (ext === "c" || ext === "h") return "c";
    if (["cpp", "cc", "cxx", "hpp"].includes(ext || "")) return "cpp";
    return "python";
  };

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
    setCurrentPhase(0);
    setCurrentLine(0);
    setLogs([]);
    
    const firstFile = uploadedFiles[0];
    const detectedLang = firstFile 
      ? detectLanguage(firstFile.name) 
      : language === "auto" ? "python" : language;
    
    const code = fileContent || MOCK_CODE[detectedLang as keyof typeof MOCK_CODE] || MOCK_CODE.python;
    const lines = code.split("\n");
    
    const initialLines: CodeLine[] = lines.map((content, index) => ({
      lineNumber: index + 1,
      content,
      status: "pending" as const,
    }));
    setCodeLines(initialLines);
    setStats({
      linesScanned: 0,
      totalLines: lines.length,
      vulnerabilitiesFound: 0,
      elapsedTime: 0,
    });

    const vulns = VULNERABILITY_PATTERNS.filter(v => v.lang === detectedLang);

    addLog("Initializing SecureGuard AI Scanner v2.1.0...", "info");
    await new Promise(r => setTimeout(r, 800));
    addLog("Loading vulnerability database (15,234 patterns)...", "info");
    await new Promise(r => setTimeout(r, 600));
    addLog("AI engine ready", "success");
    setCurrentPhase(1);

    addLog(`Parsing ${detectedLang.toUpperCase()} source code...`, "info");
    await new Promise(r => setTimeout(r, 500));
    addLog(`Found ${lines.length} lines of code`, "info");
    await new Promise(r => setTimeout(r, 400));
    addLog("Building Abstract Syntax Tree...", "info");
    await new Promise(r => setTimeout(r, 600));
    addLog("Syntax tree constructed successfully", "success");
    setCurrentPhase(2);

    addLog("Starting vulnerability scan...", "info");
    let vulnCount = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < lines.length; i++) {
      if (scanAbortRef.current) break;
      
      const lineNum = i + 1;
      setCurrentLine(lineNum);
      
      const vuln = vulns.find(v => v.line === lineNum);
      
      setCodeLines(prev => prev.map((line, idx) => {
        if (idx === i) {
          return { ...line, status: "scanning" };
        }
        if (idx < i) {
          const prevVuln = vulns.find(v => v.line === idx + 1);
          return {
            ...line,
            status: prevVuln ? "vulnerable" : "safe",
            vulnerability: prevVuln?.message,
          };
        }
        return line;
      }));
      
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setStats(prev => ({
        ...prev,
        linesScanned: lineNum,
        elapsedTime: elapsed,
        vulnerabilitiesFound: vulnCount,
      }));

      if (vuln) {
        vulnCount++;
        addLog(`Line ${lineNum}: Potential ${vuln.message} detected`, "warning");
        await new Promise(r => setTimeout(r, 300));
      } else if (lineNum % 5 === 0) {
        addLog(`Scanning line ${lineNum}...`, "info");
      }
      
      await new Promise(r => setTimeout(r, 100));
    }
    
    if (scanAbortRef.current) return;

    setCodeLines(prev => prev.map((line, idx) => {
      if (idx === lines.length - 1) {
        const lastVuln = vulns.find(v => v.line === lines.length);
        return {
          ...line,
          status: lastVuln ? "vulnerable" : "safe",
          vulnerability: lastVuln?.message,
        };
      }
      return line;
    }));

    setCurrentPhase(3);
    addLog("Running deep AI analysis...", "info");
    await new Promise(r => setTimeout(r, 1000));
    addLog("Analyzing data flow patterns...", "info");
    await new Promise(r => setTimeout(r, 800));
    addLog("Checking for complex vulnerability chains...", "info");
    await new Promise(r => setTimeout(r, 600));
    addLog("Deep analysis complete", "success");

    setCurrentPhase(4);
    addLog("Generating security report...", "info");
    await new Promise(r => setTimeout(r, 800));
    addLog(`Found ${vulnCount} potential vulnerabilities`, vulnCount > 0 ? "warning" : "success");
    await new Promise(r => setTimeout(r, 400));
    addLog("Report generated successfully", "success");

    setCurrentPhase(5);
    setStats(prev => ({
      ...prev,
      vulnerabilitiesFound: vulnCount,
      elapsedTime: Math.floor((Date.now() - startTime) / 1000),
    }));
    setIsScanning(false);
    setScanComplete(true);
    addLog("Scan complete!", "success");
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
    const newFiles = Array.from(e.dataTransfer.files);
    if (newFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...newFiles]);
      // Read first file content for scanning
      const reader = new FileReader();
      reader.onload = (ev) => {
        setFileContent(ev.target?.result as string || "");
      };
      reader.readAsText(newFiles[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    if (newFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...newFiles]);
      // Read first file content for scanning
      if (uploadedFiles.length === 0) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setFileContent(ev.target?.result as string || "");
        };
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
    setStats({
      linesScanned: 0,
      totalLines: 0,
      vulnerabilitiesFound: 0,
      elapsedTime: 0,
    });
  };

  const canStartScan =
    projectName.trim() !== "" &&
    (activeTab === "upload" ? uploadedFiles.length > 0 : !!repoUrl);

  // Determine GitHub tab behavior based on role
  const renderGitHubTab = () => {
    if (!isTeamMode) {
      // Personal mode: standard free-text GitHub tab
      return (
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="repo-url" className="text-sm font-medium">
              Repository URL
            </Label>
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="repo-url"
                placeholder="https://github.com/username/repository"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch" className="text-sm font-medium">
              Branch
            </Label>
            <Select value={branch} onValueChange={setBranch}>
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
    }

    // Team mode: role-based
    if (userRole === "admin") {
      if (!selectedTeam?.githubRepo) {
        return (
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-8">
              <Info className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                No repository connected to this team.
              </p>
              <Button size="sm">Connect Repository</Button>
            </div>
          </CardContent>
        );
      }

      return (
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="repo-url" className="text-sm font-medium">
              Repository URL
            </Label>
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="repo-url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch" className="text-sm font-medium">
              Branch
            </Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger id="branch">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {selectedTeam.branches?.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      );
    }

    if (userRole === "developer") {
      if (!selectedTeam?.githubRepo) {
        return (
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border/50">
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                No repository connected to this team. Ask your Admin to connect a GitHub repository.
              </p>
            </div>
          </CardContent>
        );
      }

      const member = selectedTeam?.members.find((m) => m.id === CURRENT_USER_ID);
      const assignedBranch = member?.branch;

      return (
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="repo-url" className="text-sm font-medium">
              Repository URL
            </Label>
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="repo-url"
                value={repoUrl}
                readOnly
                className="pl-10 pr-10 opacity-75"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch" className="text-sm font-medium">
              Branch
            </Label>
            {assignedBranch ? (
              <>
                <div className="relative">
                  <Select value={assignedBranch} disabled>
                    <SelectTrigger id="branch" className="opacity-75">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={assignedBranch}>{assignedBranch}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Lock className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Your branch is assigned by your team Admin
                </p>
              </>
            ) : (
              <>
                <Select disabled>
                  <SelectTrigger id="branch" className="opacity-50">
                    <SelectValue placeholder="No branch assigned" />
                  </SelectTrigger>
                  <SelectContent />
                </Select>
                <p className="text-xs text-muted-foreground">
                  Contact your Admin to assign you a branch
                </p>
              </>
            )}
          </div>
        </CardContent>
      );
    }

    return null;
  };

  // If scanning or complete, show split-screen view
  if (isScanning || scanComplete) {
    const progressPercentage = stats.totalLines > 0 
      ? Math.round((stats.linesScanned / stats.totalLines) * 100) 
      : 0;

    const firstFile = uploadedFiles[0];
    const displayName = projectName
      ? `${projectName}${firstFile ? ` · ${firstFile.name}` : ""}`
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
                  <Button size="sm" className="h-8">
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
                    <Button size="sm" className="flex-1 shadow-lg shadow-primary/25">
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
                    language={firstFile ? detectLanguage(firstFile.name) : "python"}
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
              Upload your Python, C, or C++ code to detect vulnerabilities, 
              security flaws, and potential exploits using AI-powered analysis.
            </p>
          </div>
        </div>

        {/* Project Name Input */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardContent className="pt-6 space-y-2">
            <Label htmlFor="project-name" className="text-sm font-medium">
              Project Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="project-name"
              placeholder="e.g. auth-service, frontend-app"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
            {isTeamMode && (
              <p className="text-xs text-muted-foreground">
                This scan will be saved under your team project.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Scan Mode Toggle */}
        {mockTeams.length > 0 && (
          <ScanModeToggle
            scanMode={scanMode}
            onScanModeChange={setScanMode}
            teams={mockTeams}
            selectedTeamId={selectedTeamId}
            onTeamChange={setSelectedTeamId}
          />
        )}

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
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
              <CardContent className="pt-6">
                <FileUploadArea
                  uploadedFiles={uploadedFiles}
                  isDragOver={isDragOver}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onFileSelect={handleFileSelect}
                  onRemoveFile={handleRemoveFile}
                />
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
                      <SelectItem value="python">Python</SelectItem>
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
