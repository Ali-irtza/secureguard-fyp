import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
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
  FileCode,
  Settings2,
  ChevronDown,
  Play,
  Loader2,
  CheckCircle2,
  Sparkles,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ScanStep = {
  label: string;
  status: "pending" | "active" | "completed";
};

const NewScan = () => {
  const [activeTab, setActiveTab] = useState("upload");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [language, setLanguage] = useState("auto");
  const [deepAnalysis, setDeepAnalysis] = useState(true);
  const [checkSecrets, setCheckSecrets] = useState(true);

  const scanSteps: ScanStep[] = [
    { label: "Initializing AI...", status: currentStepIndex > 0 ? "completed" : currentStepIndex === 0 && isScanning ? "active" : "pending" },
    { label: "Parsing Source Code...", status: currentStepIndex > 1 ? "completed" : currentStepIndex === 1 ? "active" : "pending" },
    { label: "Scanning for Vulnerabilities...", status: currentStepIndex > 2 ? "completed" : currentStepIndex === 2 ? "active" : "pending" },
    { label: "Running Deep Analysis...", status: currentStepIndex > 3 ? "completed" : currentStepIndex === 3 ? "active" : "pending" },
    { label: "Generating Report...", status: currentStepIndex > 4 ? "completed" : currentStepIndex === 4 ? "active" : "pending" },
  ];

  const handleStartScan = () => {
    setIsScanning(true);
    setCurrentStepIndex(0);

    // Simulate scan progress
    const stepDuration = 1500;
    scanSteps.forEach((_, index) => {
      setTimeout(() => {
        setCurrentStepIndex(index + 1);
      }, stepDuration * (index + 1));
    });

    // Complete scan
    setTimeout(() => {
      setIsScanning(false);
    }, stepDuration * (scanSteps.length + 1));
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
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const progressPercentage = isScanning 
    ? Math.min((currentStepIndex / scanSteps.length) * 100, 100) 
    : currentStepIndex === scanSteps.length ? 100 : 0;

  const canStartScan = activeTab === "upload" ? !!uploadedFile : !!repoUrl;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">New Scan</h1>
          <p className="text-muted-foreground mt-1">
            Upload your code or import from GitHub to start a security analysis
          </p>
        </div>

        {/* Scanning State */}
        {isScanning || currentStepIndex === scanSteps.length ? (
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {currentStepIndex === scanSteps.length ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    Scan Complete
                  </>
                ) : (
                  <>
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    Scanning in Progress
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="text-primary font-medium">{Math.round(progressPercentage)}%</span>
                </div>
                <Progress value={progressPercentage} className="h-2" />
              </div>

              {/* Scan Steps */}
              <div className="space-y-3">
                {scanSteps.map((step, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg transition-all duration-300",
                      step.status === "active" && "bg-primary/10 border border-primary/30",
                      step.status === "completed" && "bg-primary/5",
                      step.status === "pending" && "opacity-50"
                    )}
                  >
                    {step.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    ) : step.status === "active" ? (
                      <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                    )}
                    <span className={cn(
                      "text-sm font-medium",
                      step.status === "active" && "text-primary",
                      step.status === "completed" && "text-foreground",
                      step.status === "pending" && "text-muted-foreground"
                    )}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Actions when complete */}
              {currentStepIndex === scanSteps.length && (
                <div className="flex gap-3 pt-4">
                  <Button className="flex-1 shadow-lg shadow-primary/25">
                    View Report
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setCurrentStepIndex(0);
                      setUploadedFile(null);
                      setRepoUrl("");
                    }}
                  >
                    New Scan
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
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
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={cn(
                        "relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 cursor-pointer",
                        isDragOver 
                          ? "border-primary bg-primary/10" 
                          : uploadedFile 
                            ? "border-primary/50 bg-primary/5" 
                            : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      <input
                        type="file"
                        accept=".py,.cpp,.c,.h,.hpp,.zip,.js,.ts,.jsx,.tsx"
                        onChange={handleFileSelect}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      
                      {uploadedFile ? (
                        <div className="space-y-3">
                          <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                            <FileCode className="h-8 w-8 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{uploadedFile.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {(uploadedFile.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUploadedFile(null);
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                            <Upload className="h-8 w-8 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">
                              Drop files here or click to browse
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                              Supports .py, .cpp, .c, .js, .ts, or .zip files
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
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
              Start Analysis
            </Button>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default NewScan;
