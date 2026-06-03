import { Shield, ShieldAlert, Activity, TrendingUp, TrendingDown } from "lucide-react";
import RadialProgress from "./RadialProgress";
import Sparkline from "./Sparkline";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: "default" | "critical" | "warning" | "success";
  children?: React.ReactNode;
  teamLabel?: boolean;
  sparklineData?: Array<{ value: number }>;
  trend?: number;
  trendLabel?: string;
  detail: string;
  backValue?: string | number;
}

const MetricCard = ({ 
  title, 
  value, 
  icon, 
  variant = "default", 
  children, 
  teamLabel,
  sparklineData,
  trend,
  trendLabel,
  detail,
  backValue
}: MetricCardProps) => {
  const variantStyles = {
    default: "border-cyan-400/45 bg-gradient-to-br from-cyan-200/80 via-sky-100/85 to-white/95 dark:from-cyan-950/45 dark:via-sky-950/25 dark:to-slate-900/80",
    critical: "border-red-400/45 bg-gradient-to-br from-red-200/80 via-rose-100/85 to-white/95 dark:from-red-950/45 dark:via-rose-950/25 dark:to-slate-900/80",
    warning: "border-yellow-400/45 bg-gradient-to-br from-yellow-200/80 via-amber-100/85 to-white/95 dark:from-yellow-950/35 dark:via-amber-950/25 dark:to-slate-900/80",
    success: "border-emerald-400/45 bg-gradient-to-br from-emerald-200/80 via-teal-100/85 to-white/95 dark:from-emerald-950/45 dark:via-teal-950/25 dark:to-slate-900/80",
  };

  const valueStyles = {
    default: "text-cyan-500",
    critical: "text-red-500",
    warning: "text-yellow-600",
    success: "text-emerald-500",
  };

  const iconBgStyles = {
    default: "bg-cyan-400/25 text-cyan-500 ring-cyan-400/25",
    critical: "bg-red-400/25 text-red-500 ring-red-400/25",
    warning: "bg-yellow-400/25 text-yellow-600 ring-yellow-400/25",
    success: "bg-emerald-400/25 text-emerald-500 ring-emerald-400/25",
  };

  const backStyles = {
    default: "from-cyan-500 to-blue-500 shadow-cyan-500/25",
    critical: "from-red-500 to-rose-500 shadow-red-500/25",
    warning: "from-yellow-500 to-orange-500 shadow-yellow-500/25",
    success: "from-emerald-500 to-teal-500 shadow-emerald-500/25",
  };

  const trendColor = trend && trend >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="metric-card-3d min-h-[200px] animate-fade-in">
      <div className="metric-card-3d-inner">
        <div className={`metric-card-face glass-card p-6 min-h-[200px] border ${variantStyles[variant]}`}>
          <div className="flex flex-col h-full">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground font-medium">{title}</p>
              </div>
              <div className={`p-2.5 rounded-lg ring-1 ${iconBgStyles[variant]}`}>
                {icon}
              </div>
            </div>

            <div className="flex-1">
              {children || (
                <p className={`text-4xl font-bold ${valueStyles[variant]} mb-2`}>{value}</p>
              )}

              {trend !== undefined && (
                <div className="flex items-center gap-1.5 mb-4">
                  {trend >= 0 ? (
                    <TrendingUp className={`h-4 w-4 ${trendColor}`} />
                  ) : (
                    <TrendingDown className={`h-4 w-4 ${trendColor}`} />
                  )}
                  <span className={`text-sm font-semibold ${trendColor}`}>
                    {trend >= 0 ? "+" : ""}{trend}%
                  </span>
                  {trendLabel && (
                    <span className="text-xs text-muted-foreground ml-1">{trendLabel}</span>
                  )}
                </div>
              )}

              {teamLabel && (
                <p className="text-xs text-muted-foreground mb-3">Team</p>
              )}
            </div>

            {sparklineData && sparklineData.length > 0 && (
              <div className="mt-3 -mx-2 -mb-2">
                <Sparkline
                  data={sparklineData}
                  color={
                    variant === "critical" ? "#f87171" :
                    variant === "warning" ? "#facc15" :
                    variant === "success" ? "#10b981" :
                    "#06b6d4"
                  }
                  height={35}
                />
              </div>
            )}
          </div>
        </div>
        <div className={`metric-card-face metric-card-back min-h-[200px] bg-gradient-to-br ${backStyles[variant]} p-6 text-white shadow-2xl`}>
          <div className="flex h-full flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-normal text-white/85">{title}</span>
              <div className="rounded-lg bg-white/20 p-2.5 text-white ring-1 ring-white/25">
                {icon}
              </div>
            </div>
            <div>
              <p className="text-5xl font-bold leading-none">{backValue ?? value}</p>
              <p className="mt-3 text-sm font-medium text-white/90">{detail}</p>
            </div>
            <div className="h-1.5 rounded-full bg-white/25">
              <div className="h-full w-2/3 rounded-full bg-white/80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface MetricsRowProps {
  totalScans: number;
  criticalVulns: number;
  healthScore: number;
  isTeamView?: boolean;
}

const MetricsRow = ({ totalScans, criticalVulns, healthScore, isTeamView }: MetricsRowProps) => {
  // Generate sparkline data (simulating last 7 days)
  const generateSparklineData = (baseValue: number, trend: number) => {
    const data = [];
    for (let i = 0; i < 7; i++) {
      const variance = Math.sin(i * 0.5) * baseValue * 0.2;
      const value = Math.max(0, baseValue * (0.7 + (i / 7) * 0.5) + variance);
      data.push({ value: Math.round(value) });
    }
    return data;
  };

  // Trend calculations (vs last 7 days)
  const scansTrend = 12; // Mock trend
  const criticalTrend = 8; // Mock trend
  const healthTrend = -3; // Mock trend

  const scansSparkline = generateSparklineData(totalScans / 7, scansTrend);
  const criticalSparkline = generateSparklineData(criticalVulns / 5, criticalTrend);
  const healthSparkline = generateSparklineData(healthScore / 100, healthTrend);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="animate-slide-up stagger-1">
        <MetricCard
          title="Total Scans"
          value={totalScans}
          icon={<Shield className="h-5 w-5" />}
          variant="default"
          teamLabel={isTeamView}
          sparklineData={scansSparkline}
          trend={scansTrend}
          trendLabel="vs last 7 days"
          detail="Recent scan coverage is trending upward across your projects."
        />
      </div>
      <div className="animate-slide-up stagger-2">
        <MetricCard
          title="Critical Vulns"
          value={criticalVulns}
          icon={<ShieldAlert className="h-5 w-5" />}
          variant="critical"
          teamLabel={isTeamView}
          sparklineData={criticalSparkline}
          trend={criticalTrend}
          trendLabel="vs last 7 days"
          detail="Critical findings need attention before the next release."
        />
      </div>
      <div className="animate-slide-up stagger-3">
        <MetricCard
          title={isTeamView ? "Team Health Score" : "Health Score"}
          value=""
          icon={<Activity className="h-5 w-5" />}
          variant="success"
          teamLabel={isTeamView}
          sparklineData={healthSparkline}
          trend={healthTrend}
          trendLabel="vs last 7 days"
          detail="Overall posture combines scans, critical issues, and recent trends."
          backValue={`${healthScore}%`}
        >
          <RadialProgress value={healthScore} />
        </MetricCard>
      </div>
    </div>
  );
};

export default MetricsRow;
