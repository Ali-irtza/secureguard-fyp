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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeViewer } from "@/components/scan/CodeViewer";
import { ScanningProgress } from "@/components/scan/ScanningProgress";
import { ScanLogTerminal, LogEntry } from "@/components/scan/ScanLogTerminal";
import { FileUploadArea } from "@/components/scan/FileUploadArea";

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
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [language, setLanguage] = useState("auto");
  const [deepAnalysis, setDeepAnalysis] = useState(true);
  const [checkSecrets, setCheckSecrets] = useState(true);
  
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
    
    // Determine language and get code
    const detectedLang = uploadedFile 
      ? detectLanguage(uploadedFile.name) 
      : language === "auto" ? "python" : language;
    
    // Use uploaded file content or mock code
    const code = fileContent || MOCK_CODE[detectedLang as keyof typeof MOCK_CODE] || MOCK_CODE.python;
    const lines = code.split("\n");
    
    // Initialize code lines
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

    // Get vulnerabilities for this language
    const vulns = VULNERABILITY_PATTERNS.filter(v => v.lang === detectedLang);

    // Phase 0: Initialize
    addLog("Initializing SecureGuard AI Scanner v2.1.0...", "info");
    await new Promise(r => setTimeout(r, 800));
    addLog("Loading vulnerability database (15,234 patterns)...", "info");
    await new Promise(r => setTimeout(r, 600));
    addLog("AI engine ready", "success");
    setCurrentPhase(1);

    // Phase 1: Parse
    addLog(`Parsing ${detectedLang.toUpperCase()} source code...`, "info");
    await new Promise(r => setTimeout(r, 500));
    addLog(`Found ${lines.length} lines of code`, "info");
    await new Promise(r => setTimeout(r, 400));
    addLog("Building Abstract Syntax Tree...", "info");
    await new Promise(r => setTimeout(r, 600));
    addLog("Syntax tree constructed successfully", "success");
    setCurrentPhase(2);

    // Phase 2: Line-by-line scanning
    addLog("Starting vulnerability scan...", "info");
    let vulnCount = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < lines.length; i++) {
      // Check for abort
      if (scanAbortRef.current) {
        break;
      }
      
      const lineNum = i + 1;
      setCurrentLine(lineNum);
      
      // Check for vulnerability
      const vuln = vulns.find(v => v.line === lineNum);
      
      // Update line status
      setCodeLines(prev => prev.map((line, idx) => {
        if (idx === i) {
          return {
            ...line,
            status: "scanning",
          };
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
      
      // Update stats
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
    
    // If aborted, don't complete the scan
    if (scanAbortRef.current) {
      return;
    }

    // Mark last line
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

    // Phase 3: Deep analysis
    setCurrentPhase(3);
    addLog("Running deep AI analysis...", "info");
    await new Promise(r => setTimeout(r, 1000));
    addLog("Analyzing data flow patterns...", "info");
    await new Promise(r => setTimeout(r, 800));
    addLog("Checking for complex vulnerability chains...", "info");
    await new Promise(r => setTimeout(r, 600));
    addLog("Deep analysis complete", "success");

    // Phase 4: Generate report
    setCurrentPhase(4);
    addLog("Generating security report...", "info");
    await new Promise(r => setTimeout(r, 800));
    addLog(`Found ${vulnCount} potential vulnerabilities`, vulnCount > 0 ? "warning" : "success");
    await new Promise(r => setTimeout(r, 400));
    addLog("Report generated successfully", "success");

    // Complete
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
    const file = e.dataTransfer.files[0];
    if (file) {
      setUploadedFile(file);
      // Read file content
      const reader = new FileReader();
      reader.onload = (e) => {
        setFileContent(e.target?.result as string || "");
      };
      reader.readAsText(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      // Read file content
      const reader = new FileReader();
      reader.onload = (e) => {
        setFileContent(e.target?.result as string || "");
      };
      reader.readAsText(file);
    }
  };

  const handleReset = () => {
    setIsScanning(false);
    setScanComplete(false);
    setCurrentPhase(0);
    setCurrentLine(0);
    setCodeLines([]);
    setLogs([]);
    setUploadedFile(null);
    setFileContent("");
    setRepoUrl("");
    setStats({
      linesScanned: 0,
      totalLines: 0,
      vulnerabilitiesFound: 0,
      elapsedTime: 0,
    });
  };

  const canStartScan = activeTab === "upload" ? !!uploadedFile : !!repoUrl;

  // If scanning or complete, show split-screen view
  if (isScanning || scanComplete) {
    return (
      <DashboardLayout>
        <div className="h-[calc(100vh-4rem)] -m-4 lg:-m-6 flex flex-col">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 md:p-4 border-b border-border/50 bg-background">
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="icon" className="shrink-0" onClick={handleReset}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary shrink-0" />
                  <span className="truncate">Security Analysis</span>
                </h1>
                <p className="text-sm text-muted-foreground truncate">
                  {uploadedFile?.name || "Code Analysis"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isScanning && (
                <Button variant="destructive" size="sm" onClick={handleStopScan}>
                  <StopCircle className="h-4 w-4 mr-1.5" />
                  Stop
                </Button>
              )}
              {scanComplete && (
                <>
                  <Button size="sm" className="shadow-lg shadow-primary/25">
                    View Report
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    New Scan
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Split Screen - 40% / 60% */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel - Progress (40%) */}
            <div className="w-2/5 min-w-[280px] shrink-0 border-r border-border/50 bg-card/30 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                <ScanningProgress
                  currentPhase={currentPhase}
                  stats={stats}
                  isComplete={scanComplete}
                />
              </div>
              
              {/* Terminal Logs in left panel */}
              <div className="p-4 border-t border-border/50">
                <ScanLogTerminal
                  logs={logs}
                  isExpanded={logsExpanded}
                  onToggleExpand={() => setLogsExpanded(!logsExpanded)}
                />
              </div>
            </div>

            {/* Right Panel - Code Viewer (60%) */}
            <div className="flex-1 min-w-0 flex flex-col bg-background overflow-hidden">
              <div className="flex-1 p-4 overflow-hidden">
                <CodeViewer
                  lines={codeLines}
                  currentLine={currentLine}
                  language={uploadedFile ? detectLanguage(uploadedFile.name) : "python"}
                />
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
                  uploadedFile={uploadedFile}
                  isDragOver={isDragOver}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onFileSelect={handleFileSelect}
                  onRemoveFile={() => {
                    setUploadedFile(null);
                    setFileContent("");
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* GitHub Tab */}
          <TabsContent value="github" className="mt-6">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
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
