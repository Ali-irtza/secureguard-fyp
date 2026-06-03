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

  const safeTotalLines = Math.max(0, stats.totalLines);
  const safeLinesScanned = safeTotalLines > 0
    ? Math.min(Math.max(0, stats.linesScanned), safeTotalLines)
    : Math.max(0, stats.linesScanned);
  const rawProgressPercentage = safeTotalLines > 0
    ? Math.round((safeLinesScanned / safeTotalLines) * 100)
    : 0;
  const progressPercentage = isComplete
    ? Math.min(100, rawProgressPercentage)
    : Math.min(95, rawProgressPercentage);

  return (
    <div className="h-full flex flex-col p-3 bg-gradient-to-b from-[#0b121d] via-[#0b1019] to-[#080d15]">
      <div className="grid grid-cols-3 gap-2 border-b border-emerald-500/15 pb-3">
        <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2 py-2 shadow-inner shadow-cyan-950/20">
          <div className="flex items-center gap-1.5 text-[10px] uppercase text-cyan-200/80">
            <Code2 className="h-3 w-3" />
            Lines
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-cyan-50">
            {safeLinesScanned}<span className="text-cyan-200/50">/{safeTotalLines}</span>
          </p>
        </div>
        <div className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2 py-2 shadow-inner shadow-violet-950/20">
          <div className="flex items-center gap-1.5 text-[10px] uppercase text-violet-200/80">
            <Clock3 className="h-3 w-3" />
            Time
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-violet-50">{elapsedDisplay}</p>
        </div>
        <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-2 shadow-inner shadow-rose-950/20">
          <div className="flex items-center gap-1.5 text-[10px] uppercase text-rose-200/80">
            <AlertTriangle className="h-3 w-3" />
            Issues
          </div>
          <p
            className={cn(
              "mt-1 font-mono text-sm font-semibold",
              stats.vulnerabilitiesFound > 0 ? "text-rose-300" : "text-rose-50"
            )}
          >
            {stats.vulnerabilitiesFound}
          </p>
        </div>
      </div>

      <div className="space-y-2 py-4">
        <div className="h-2.5 overflow-hidden rounded-full bg-white/8 shadow-inner">
          <div
            className={cn(
              "h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-primary transition-all duration-500",
              !isComplete && "animate-gradient-shift shadow-[0_0_18px_rgba(16,185,129,0.55)]"
            )}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <div className="flex justify-between text-xs">
          <span className={cn("font-medium", isComplete ? "text-emerald-300" : "text-cyan-100/80")}>
            {isComplete ? "Complete" : "Scanning..."}
          </span>
          <span className="text-emerald-300 font-mono font-medium">{progressPercentage}%</span>
        </div>
      </div>

      <div className="flex-1 space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-cyan-100/70">Phases</h3>
        {phases.map((phase) => (
          <div
            key={phase.id}
            className={cn(
              "relative flex items-center gap-3 rounded-xl border px-3 py-3 text-xs transition-all",
              phase.status === "active" && "border-emerald-400/45 bg-emerald-500/15 shadow-[0_0_24px_rgba(16,185,129,0.18)]",
              phase.status === "completed" && "border-emerald-500/25 bg-emerald-500/10 text-foreground",
              phase.status === "pending" && "border-white/5 bg-white/[0.02] text-muted-foreground/65"
            )}
          >
            {phase.status === "active" && (
              <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-cyan-400 to-primary" />
            )}
            <div
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full border",
                phase.status === "active" && "border-emerald-300/50 bg-emerald-400/20 text-emerald-200",
                phase.status === "completed" && "border-emerald-400/35 bg-emerald-500/15 text-emerald-300",
                phase.status === "pending" && "border-white/10 bg-white/[0.04] text-muted-foreground"
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
                phase.status === "active" && "text-emerald-200",
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
