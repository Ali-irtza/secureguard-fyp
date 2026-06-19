import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldCheck, X, AlertTriangle, FileText, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  dismissGlobalScanActivity,
  failGlobalScanActivity,
  getGlobalScanActivity,
  subscribeToGlobalScanActivity,
  type GlobalScanActivity,
} from "@/lib/scan-activity";
import { cancelScan } from "@/lib/scans-api";

const formatElapsed = (startedAt: number) => {
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const GlobalScanActivityToast = () => {
  const navigate = useNavigate();
  const [activity, setActivity] = useState<GlobalScanActivity | null>(() => getGlobalScanActivity());
  const [elapsed, setElapsed] = useState(() => activity ? formatElapsed(activity.startedAt) : "0:00");

  useEffect(() => subscribeToGlobalScanActivity(setActivity), []);

  useEffect(() => {
    if (!activity || activity.status !== "running") return;
    setElapsed(formatElapsed(activity.startedAt));
    const timer = window.setInterval(() => setElapsed(formatElapsed(activity.startedAt)), 1000);
    return () => window.clearInterval(timer);
  }, [activity?.id, activity?.startedAt, activity?.status]);

  const statusConfig = useMemo(() => {
    if (!activity) return null;
    if (activity.status === "completed") {
      return {
        icon: CheckCircle2,
        title: "Scan complete",
        accent: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
        pulse: false,
      };
    }
    if (activity.status === "failed") {
      return {
        icon: AlertTriangle,
        title: "Scan needs attention",
        accent: "border-destructive/40 bg-destructive/10 text-destructive",
        pulse: false,
      };
    }
    return {
      icon: ShieldCheck,
      title: "Scan running",
      accent: "border-primary/40 bg-primary/10 text-primary",
      pulse: true,
    };
  }, [activity]);

  if (!activity || !statusConfig) return null;

  const Icon = statusConfig.icon;
  const showReportLink = activity.status === "completed";
  const openActiveScan = () => {
    if (activity.status !== "running") return;
    navigate(activity.activePath ?? "/new-scan?resumeScan=1");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("secureguard:resume-scan-view"));
    }, 0);
  };
  const cancelActiveScan = async () => {
    window.dispatchEvent(new CustomEvent("secureguard:cancel-active-scan"));
    if (activity.scanId) {
      await cancelScan(activity.scanId).catch(() => undefined);
    }
    failGlobalScanActivity(activity.id, "Scan cancelled by user.");
  };

  return (
    <div className="fixed bottom-5 right-5 z-[80] w-[min(420px,calc(100vw-2rem))] animate-slide-up">
      <div className="overflow-hidden rounded-lg border border-border/70 bg-background/95 shadow-2xl shadow-black/35 backdrop-blur-xl">
        <div className={cn("h-1 bg-primary", activity.status === "completed" && "bg-emerald-500", activity.status === "failed" && "bg-destructive")} />
        <div
          className={cn("p-4", activity.status === "running" && "cursor-pointer")}
          onClick={openActiveScan}
          role={activity.status === "running" ? "button" : undefined}
          tabIndex={activity.status === "running" ? 0 : undefined}
          onKeyDown={(event) => {
            if (activity.status === "running" && (event.key === "Enter" || event.key === " ")) openActiveScan();
          }}
        >
          <div className="flex items-start gap-3">
            <div className={cn("relative grid h-10 w-10 shrink-0 place-items-center rounded-md border", statusConfig.accent)}>
              {activity.status === "running" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Icon className="h-5 w-5" />
              )}
              {statusConfig.pulse && (
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-primary shadow-[0_0_0_5px_rgba(16,185,129,0.12)]" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{statusConfig.title}</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-foreground/90">{activity.title}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    dismissGlobalScanActivity();
                  }}
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <p className="mt-2 text-sm text-muted-foreground">{activity.detail}</p>

              {activity.status === "running" && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Model analysis is active</span>
                    <span className="font-mono">{elapsed}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-1/2 animate-global-scan-progress rounded-full bg-primary" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">Click this message to return to the live scan.</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7 gap-1.5"
                      onClick={(event) => {
                        event.stopPropagation();
                        cancelActiveScan();
                      }}
                    >
                      <StopCircle className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {showReportLink && (
                <Button asChild size="sm" className="mt-3 h-8 gap-2">
                  <Link to={activity.reportPath ?? "/reports"}>
                    <FileText className="h-3.5 w-3.5" />
                    Open report
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
