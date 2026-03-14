import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Team, TeamRole } from "@/lib/team-data";

interface TeamViewToggleProps {
  viewMode: "personal" | "team";
  onViewModeChange: (mode: "personal" | "team") => void;
  teams: Team[];
  selectedTeamId: string;
  onTeamChange: (teamId: string) => void;
}

const roleBadgeStyles: Record<TeamRole, string> = {
  admin: "bg-primary/20 text-primary border-primary/30",
  developer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  viewer: "bg-muted text-muted-foreground border-border",
};

const TeamViewToggle = ({
  viewMode,
  onViewModeChange,
  teams,
  selectedTeamId,
  onTeamChange,
}: TeamViewToggleProps) => {
  if (teams.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-4 animate-fade-in">
      <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border/50">
        <Button
          size="sm"
          variant={viewMode === "personal" ? "default" : "ghost"}
          className="h-8 px-4 text-xs font-medium"
          onClick={() => onViewModeChange("personal")}
        >
          Personal
        </Button>
        <Button
          size="sm"
          variant={viewMode === "team" ? "default" : "ghost"}
          className="h-8 px-4 text-xs font-medium"
          onClick={() => onViewModeChange("team")}
        >
          Team
        </Button>
      </div>

      {viewMode === "team" && (
        <Select value={selectedTeamId} onValueChange={onTeamChange}>
          <SelectTrigger className="w-[280px] h-9 bg-muted/50 border-border/50 text-sm">
            <SelectValue placeholder="Select a team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                <span className="flex items-center gap-2">
                  {team.currentUserRole === "admin" && (
                    <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                  )}
                  <span className="truncate">{team.name}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 h-4 capitalize ${roleBadgeStyles[team.currentUserRole]}`}
                  >
                    {team.currentUserRole}
                  </Badge>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};

export default TeamViewToggle;
