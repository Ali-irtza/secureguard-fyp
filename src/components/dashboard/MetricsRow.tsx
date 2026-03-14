import { Shield, ShieldAlert, Activity, Clock } from "lucide-react";
import RadialProgress from "./RadialProgress";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: "default" | "critical" | "warning" | "success";
  children?: React.ReactNode;
}

const MetricCard = ({ title, value, icon, variant = "default", children }: MetricCardProps) => {
  const variantStyles = {
    default: "border-primary/20",
    critical: "border-destructive/30",
    warning: "border-yellow-500/30",
    success: "border-primary/30",
  };

  const valueStyles = {
    default: "text-foreground",
    critical: "text-destructive",
    warning: "text-yellow-500",
    success: "text-primary",
  };

  return (
    <div className={`glass-card p-6 hover-glow animate-fade-in min-h-[140px] ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between h-full">
        <div className="flex flex-col justify-between h-full">
          <p className="text-sm text-muted-foreground">{title}</p>
          <div className="mt-2">
            {children || (
              <p className={`text-3xl font-bold ${valueStyles[variant]}`}>{value}</p>
            )}
            {teamLabel && (
              <p className="text-xs text-muted-foreground mt-1">Team</p>
            )}
          </div>
        </div>
        <div className={`p-3 rounded-xl bg-muted/50 ${variant === "critical" ? "text-destructive" : "text-primary"}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

interface MetricsRowProps {
  totalScans: number;
  criticalVulns: number;
  healthScore: number;
  pendingScans: number;
  isTeamView?: boolean;
}

const MetricsRow = ({ totalScans, criticalVulns, healthScore, pendingScans, isTeamView }: MetricsRowProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="animate-slide-up stagger-1">
        <MetricCard
          title="Total Scans"
          value={totalScans}
          icon={<Shield className="h-6 w-6" />}
          variant="default"
        />
      </div>
      <div className="animate-slide-up stagger-2">
        <MetricCard
          title="Critical Vulns"
          value={criticalVulns}
          icon={<ShieldAlert className="h-6 w-6" />}
          variant="critical"
        />
      </div>
      <div className="animate-slide-up stagger-3">
        <MetricCard
          title="Health Score"
          value=""
          icon={<Activity className="h-6 w-6" />}
          variant="success"
        >
          <RadialProgress value={healthScore} />
        </MetricCard>
      </div>
      <div className="animate-slide-up stagger-4">
        <MetricCard
          title="Pending Scans"
          value={pendingScans}
          icon={<Clock className="h-6 w-6" />}
          variant="warning"
        />
      </div>
    </div>
  );
};

export default MetricsRow;
