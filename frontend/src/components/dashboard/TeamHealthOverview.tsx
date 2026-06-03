import { Badge } from "@/components/ui/badge";
import type { TeamDashboardMember, TeamRole } from "@/lib/teams-api";

interface TeamHealthOverviewProps {
  teamName: string;
  members: TeamDashboardMember[];
  currentUserId: string;
  userRole: TeamRole;
}

const getScoreRingColor = (score: number | null) => {
  if (score === null) return "stroke-muted";
  if (score >= 80) return "stroke-primary";
  if (score >= 50) return "stroke-yellow-500";
  return "stroke-destructive";
};

const formatLastScan = (lastScanAt: string | null) => {
  if (!lastScanAt) return null;
  const diffMs = Date.now() - new Date(lastScanAt).getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60_000));
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${Math.floor(diffHours / 24)} days ago`;
};

const MiniRadial = ({ score }: { score: number }) => {
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative h-12 w-12 flex-shrink-0">
      <svg className="h-12 w-12 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="none" className="stroke-muted/30" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          className={getScoreRingColor(score)}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
        {score}
      </span>
    </div>
  );
};

const TeamHealthOverview = ({ teamName, members, currentUserId }: TeamHealthOverviewProps) => {
  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      <div className="p-6 border-b border-border/50">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          Team Health Overview
          <span className="text-sm font-normal text-muted-foreground">- {teamName}</span>
        </h3>
      </div>
      <div className="p-6 overflow-x-auto">
        <div className="flex gap-4" style={{ minWidth: "max-content" }}>
          {members.map((member) => {
            const isCurrentUser = member.userId === currentUserId;
            const lastScan = formatLastScan(member.lastScanAt);

            return (
              <div
                key={member.userId}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/20 border border-border/30 min-w-[160px] ${
                  isCurrentUser ? "border-l-2 !border-l-primary" : ""
                }`}
              >
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold text-primary">
                  {member.initials}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">{member.name}</span>
                  {isCurrentUser && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/30">
                      You
                    </Badge>
                  )}
                </div>

                <span className="text-xs text-muted-foreground text-center max-w-[130px] truncate">
                  {member.branch}
                </span>

                {member.healthScore !== null ? (
                  <>
                    <MiniRadial score={member.healthScore} />
                    <span className="text-xs text-muted-foreground">{lastScan}</span>
                  </>
                ) : (
                  <span className="text-xs text-destructive/70 mt-2">Not scanned yet</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TeamHealthOverview;
