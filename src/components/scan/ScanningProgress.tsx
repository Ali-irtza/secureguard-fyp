import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Cpu,
  FileSearch,
  Bug,
  FileText,
} from "lucide-react";

interface ScanPhase {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: "pending" | "active" | "completed";
}

interface ScanStats {
  linesScanned: number;
  totalLines: number;
  vulnerabilitiesFound: number;
  elapsedTime: number;
}

interface ScanningProgressProps {
  currentPhase: number;
  stats: ScanStats;
  isComplete: boolean;
}

export const ScanningProgress = ({ currentPhase, stats, isComplete }: ScanningProgressProps) => {
  const [elapsedDisplay, setElapsedDisplay] = useState("00:00");

  const phases: ScanPhase[] = [
    {
      id: "init",
      label: "Initializing AI Engine",
      icon: <Cpu className="h-4 w-4" />,
      status: currentPhase > 0 ? "completed" : currentPhase === 0 ? "active" : "pending",
    },
    {
      id: "parse",
      label: "Parsing Source Code",
      icon: <FileSearch className="h-4 w-4" />,
      status: currentPhase > 1 ? "completed" : currentPhase === 1 ? "active" : "pending",
    },
    {
      id: "scan",
      label: "Scanning for Vulnerabilities",
      icon: <Bug className="h-4 w-4" />,
      status: currentPhase > 2 ? "completed" : currentPhase === 2 ? "active" : "pending",
    },
    {
      id: "analyze",
      label: "Deep Analysis",
      icon: <Shield className="h-4 w-4" />,
      status: currentPhase > 3 ? "completed" : currentPhase === 3 ? "active" : "pending",
    },
    {
      id: "report",
      label: "Generating Report",
      icon: <FileText className="h-4 w-4" />,
      status: currentPhase > 4 ? "completed" : currentPhase === 4 ? "active" : "pending",
    },
  ];

  useEffect(() => {
    const minutes = Math.floor(stats.elapsedTime / 60);
    const seconds = stats.elapsedTime % 60;
    setElapsedDisplay(
      `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    );
  }, [stats.elapsedTime]);

  const progressPercentage = stats.totalLines > 0 
    ? Math.round((stats.linesScanned / stats.totalLines) * 100) 
    : 0;

  return (
    <div className="h-full flex flex-col space-y-6 p-6">
      {/* Header */}
      <div className="text-center space-y-2">
        {isComplete ? (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 text-primary">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold">Scan Complete</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
            <span className="font-semibold text-primary">Scanning...</span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="text-primary font-mono font-bold">{progressPercentage}%</span>
        </div>
        <Progress value={progressPercentage} className="h-3" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
          <div className="text-2xl font-bold text-foreground font-mono">
            {stats.linesScanned}
            <span className="text-muted-foreground text-sm font-normal">/{stats.totalLines}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Lines Scanned</div>
        </div>
        
        <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
          <div className="text-2xl font-bold font-mono text-foreground">
            {elapsedDisplay}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Elapsed Time</div>
        </div>
        
        <div className="col-span-2 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-center">
          <div className="flex items-center justify-center gap-2">
            <AlertTriangle className={cn(
              "h-5 w-5",
              stats.vulnerabilitiesFound > 0 ? "text-destructive" : "text-muted-foreground"
            )} />
            <span className={cn(
              "text-2xl font-bold font-mono",
              stats.vulnerabilitiesFound > 0 ? "text-destructive" : "text-muted-foreground"
            )}>
              {stats.vulnerabilitiesFound}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Issues Found</div>
        </div>
      </div>

      {/* Phase Steps */}
      <div className="flex-1 space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Scan Phases</h3>
        {phases.map((phase) => (
          <div
            key={phase.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg transition-all duration-300",
              phase.status === "active" && "bg-primary/10 border border-primary/30",
              phase.status === "completed" && "bg-primary/5 opacity-70",
              phase.status === "pending" && "opacity-40"
            )}
          >
            <div className={cn(
              "p-1.5 rounded",
              phase.status === "active" && "bg-primary/20 text-primary",
              phase.status === "completed" && "bg-primary/10 text-primary",
              phase.status === "pending" && "bg-muted text-muted-foreground"
            )}>
              {phase.status === "active" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : phase.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                phase.icon
              )}
            </div>
            <span className={cn(
              "text-sm font-medium",
              phase.status === "active" && "text-primary",
              phase.status === "completed" && "text-foreground",
              phase.status === "pending" && "text-muted-foreground"
            )}>
              {phase.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
