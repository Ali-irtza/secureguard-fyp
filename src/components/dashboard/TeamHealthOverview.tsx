import { Badge } from "@/components/ui/badge";
import type { Team, TeamRole } from "@/lib/team-data";

interface TeamHealthOverviewProps {
  team: Team;
  currentUserId: string;
  userRole: TeamRole;
}

const getScoreColor = (score: number | null) => {
  if (score === null) return "";
  if (score >= 80) return "bg-primary/20 text-primary border-primary/40";
  if (score >= 50) return "bg-yellow-500/20 text-yellow-500 border-yellow-500/40";
  return "bg-destructive/20 text-destructive border-destructive/40";
};

const getScoreRingColor = (score: number | null) => {
  if (score === null) return "stroke-muted";
  if (score >= 80) return "stroke-primary";
  if (score >= 50) return "stroke-yellow-500";
  return "stroke-destructive";
};

const MiniRadial = ({ score }: { score: number }) => {
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative h-12 w-12 flex-shrink-0">
      <svg className="h-12 w-12 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="none" className="stroke-muted/30" strokeWidth="3" />
        <circle
          cx="20" cy="20" r="18" fill="none"
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

const TeamHealthOverview = ({ team, currentUserId, userRole }: TeamHealthOverviewProps) => {
  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      <div className="p-6 border-b border-border/50">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          Team Health Overview
          <span className="text-sm font-normal text-muted-foreground">· {team.name}</span>
        </h3>
      </div>
      <div className="p-6 overflow-x-auto">
        <div className="flex gap-4" style={{ minWidth: "max-content" }}>
          {team.members.map((member) => {
            const isCurrentUser = member.id === currentUserId;
            return (
              <div
                key={member.id}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/20 border border-border/30 min-w-[160px] ${
                  isCurrentUser ? "border-l-2 !border-l-primary" : ""
                }`}
              >
                {/* Avatar */}
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold text-primary">
                  {member.initials}
                </div>

                {/* Name + You badge */}
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">{member.name}</span>
                  {isCurrentUser && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/30">
                      You
                    </Badge>
                  )}
                </div>

                {/* Branch */}
                <span className="text-xs text-muted-foreground">{member.branch}</span>

                {/* Health Score */}
                {member.healthScore !== null ? (
                  <>
                    <MiniRadial score={member.healthScore} />
                    <span className="text-xs text-muted-foreground">{member.lastScan}</span>
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
