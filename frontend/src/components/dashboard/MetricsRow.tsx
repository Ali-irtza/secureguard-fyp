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
  trendLabel
}: MetricCardProps) => {
  const variantStyles = {
    default: "border-cyan-500/30 bg-gradient-to-br from-slate-900/40 to-slate-800/20",
    critical: "border-red-500/30 bg-gradient-to-br from-red-950/30 to-slate-900/30",
    warning: "border-yellow-500/30 bg-gradient-to-br from-yellow-950/20 to-slate-900/30",
    success: "border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 to-slate-900/30",
  };

  const valueStyles = {
    default: "text-cyan-400",
    critical: "text-red-400",
    warning: "text-yellow-400",
    success: "text-emerald-400",
  };

  const iconBgStyles = {
    default: "bg-cyan-500/20 text-cyan-400",
    critical: "bg-red-500/20 text-red-400",
    warning: "bg-yellow-500/20 text-yellow-400",
    success: "bg-emerald-500/20 text-emerald-400",
  };

  const trendColor = trend && trend >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className={`glass-card p-6 hover-glow animate-fade-in min-h-[200px] border ${variantStyles[variant]}`}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
          </div>
          <div className={`p-2.5 rounded-lg ${iconBgStyles[variant]}`}>
            {icon}
          </div>
        </div>

        {/* Value Section */}
        <div className="flex-1">
          {children || (
            <p className={`text-4xl font-bold ${valueStyles[variant]} mb-2`}>{value}</p>
          )}
          
          {/* Trend Indicator */}
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

        {/* Sparkline Chart */}
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
        >
          <RadialProgress value={healthScore} />
        </MetricCard>
      </div>
    </div>
  );
};

export default MetricsRow;
