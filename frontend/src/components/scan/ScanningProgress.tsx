import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock3,
  Code2,
  Cpu,
  FileSearch,
  FileText,
  Loader2,
  Shield,
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
      icon: <Cpu className="h-3.5 w-3.5" />,
      status: currentPhase > 0 ? "completed" : currentPhase === 0 ? "active" : "pending",
    },
    {
      id: "parse",
      label: "Static Evidence",
      icon: <FileSearch className="h-3.5 w-3.5" />,
      status: currentPhase > 1 ? "completed" : currentPhase === 1 ? "active" : "pending",
    },
    {
      id: "scan",
      label: "Vulnerability Review",
      icon: <Bug className="h-3.5 w-3.5" />,
      status: currentPhase > 2 ? "completed" : currentPhase === 2 ? "active" : "pending",
    },
    {
      id: "analyze",
      label: "Secure Fix Draft",
      icon: <Shield className="h-3.5 w-3.5" />,
      status: currentPhase > 3 ? "completed" : currentPhase === 3 ? "active" : "pending",
    },
    {
      id: "report",
      label: "Report Assembly",
      icon: <FileText className="h-3.5 w-3.5" />,
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
    ? Math.min(100, Math.round((stats.linesScanned / stats.totalLines) * 100))
    : 0;

  return (
    <div className="h-full flex flex-col p-3">
      <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-3">
        <div className="rounded-md border border-border/50 bg-background/50 px-2 py-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
            <Code2 className="h-3 w-3" />
            Lines
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">
            {stats.linesScanned}<span className="text-muted-foreground">/{stats.totalLines}</span>
          </p>
        </div>
        <div className="rounded-md border border-border/50 bg-background/50 px-2 py-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
            <Clock3 className="h-3 w-3" />
            Time
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">{elapsedDisplay}</p>
        </div>
        <div className="rounded-md border border-border/50 bg-background/50 px-2 py-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            Issues
          </div>
          <p
            className={cn(
              "mt-1 font-mono text-sm font-semibold",
              stats.vulnerabilitiesFound > 0 ? "text-destructive" : "text-foreground"
            )}
          >
            {stats.vulnerabilitiesFound}
          </p>
        </div>
      </div>

      <div className="space-y-2 py-4">
        <div className="h-2.5 overflow-hidden rounded-full bg-muted/60 shadow-inner">
          <div
            className={cn(
              "h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-primary transition-all duration-500",
              !isComplete && "animate-gradient-shift shadow-[0_0_18px_rgba(16,185,129,0.55)]"
            )}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <div className="flex justify-between text-xs">
          <span className={cn("font-medium", isComplete ? "text-primary" : "text-muted-foreground")}>
            {isComplete ? "Complete" : "Scanning..."}
          </span>
          <span className="text-primary font-mono font-medium">{progressPercentage}%</span>
        </div>
      </div>

      <div className="flex-1 space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Phases</h3>
        {phases.map((phase) => (
          <div
            key={phase.id}
            className={cn(
              "relative flex items-center gap-3 rounded-md border px-3 py-2.5 text-xs transition-all",
              phase.status === "active" && "border-primary/35 bg-primary/10 shadow-[0_0_22px_rgba(16,185,129,0.10)]",
              phase.status === "completed" && "border-primary/15 bg-primary/5 text-foreground",
              phase.status === "pending" && "border-transparent bg-transparent text-muted-foreground/60"
            )}
          >
            {phase.status === "active" && (
              <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-cyan-400 to-primary" />
            )}
            <div
              className={cn(
                "grid h-7 w-7 place-items-center rounded-full border",
                phase.status === "active" && "border-primary/40 bg-primary/15 text-primary",
                phase.status === "completed" && "border-primary/30 bg-primary/10 text-primary",
                phase.status === "pending" && "border-border/40 bg-background/40 text-muted-foreground"
              )}
            >
              {phase.status === "active" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : phase.status === "completed" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                phase.icon
              )}
            </div>
            <span
              className={cn(
                "font-semibold",
                phase.status === "active" && "text-primary",
                phase.status === "completed" && "text-foreground",
                phase.status === "pending" && "text-muted-foreground"
              )}
            >
              {phase.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
