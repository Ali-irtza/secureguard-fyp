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
      label: "Source Intake",
      icon: <Cpu className="h-4 w-4" />,
      status: currentPhase > 0 ? "completed" : currentPhase === 0 ? "active" : "pending",
    },
    {
      id: "parse",
      label: "Static Evidence",
      icon: <FileSearch className="h-4 w-4" />,
      status: currentPhase > 1 ? "completed" : currentPhase === 1 ? "active" : "pending",
    },
    {
      id: "scan",
      label: "Vulnerability Review",
      icon: <Bug className="h-4 w-4" />,
      status: currentPhase > 2 ? "completed" : currentPhase === 2 ? "active" : "pending",
    },
    {
      id: "analyze",
      label: "Secure Fix Draft",
      icon: <Shield className="h-4 w-4" />,
      status: currentPhase > 3 ? "completed" : currentPhase === 3 ? "active" : "pending",
    },
    {
      id: "report",
      label: "Report Assembly",
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
    <div className="h-full flex flex-col space-y-3 p-3">
      {/* Compact Stats Row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/50 pb-3">
        <div className="flex items-center gap-1">
          <span className="font-mono font-medium text-foreground">{stats.linesScanned}</span>
          <span>/</span>
          <span className="font-mono">{stats.totalLines}</span>
          <span className="ml-1">lines</span>
        </div>
        <div className="font-mono">{elapsedDisplay}</div>
        <div className={cn(
          "flex items-center gap-1",
          stats.vulnerabilitiesFound > 0 ? "text-destructive" : "text-muted-foreground"
        )}>
          <AlertTriangle className="h-3 w-3" />
          <span className="font-mono font-medium">{stats.vulnerabilitiesFound}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <Progress value={progressPercentage} className="h-2" />
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            {isComplete ? "Complete" : "Scanning..."}
          </span>
          <span className="text-primary font-mono font-medium">{progressPercentage}%</span>
        </div>
      </div>

      {/* Compact Phase Steps */}
      <div className="flex-1 space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground mb-2">Phases</h3>
        {phases.map((phase) => (
          <div
            key={phase.id}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-all",
              phase.status === "active" && "bg-primary/10 border border-primary/30",
              phase.status === "completed" && "opacity-60",
              phase.status === "pending" && "opacity-40"
            )}
          >
            <div className={cn(
              "p-1 rounded",
              phase.status === "active" && "text-primary",
              phase.status === "completed" && "text-primary",
              phase.status === "pending" && "text-muted-foreground"
            )}>
              {phase.status === "active" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : phase.status === "completed" ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <span className="h-3 w-3 flex items-center justify-center">○</span>
              )}
            </div>
            <span className={cn(
              "font-medium",
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
