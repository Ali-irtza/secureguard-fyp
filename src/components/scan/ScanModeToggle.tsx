import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Info, Crown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Team, TeamRole } from "@/lib/team-data";

interface ScanModeToggleProps {
  scanMode: "personal" | "team";
  onScanModeChange: (mode: "personal" | "team") => void;
  teams: Team[];
  selectedTeamId: string;
  onTeamChange: (teamId: string) => void;
}

const roleBadgeStyles: Record<TeamRole, string> = {
  admin: "bg-primary/20 text-primary border-primary/30",
  developer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  viewer: "bg-muted text-muted-foreground border-border",
};

const ScanModeToggle = ({
  scanMode,
  onScanModeChange,
  teams,
  selectedTeamId,
  onTeamChange,
}: ScanModeToggleProps) => {
  // Filter out viewer-only teams for the dropdown
  const scanableTeams = teams.filter(
    (t) => t.currentUserRole === "admin" || t.currentUserRole === "developer"
  );
  const isViewerOnly = scanableTeams.length === 0;

  if (teams.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 animate-fade-in">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border/50">
          <Button
            size="sm"
            variant={scanMode === "personal" ? "default" : "ghost"}
            className="h-8 px-4 text-xs font-medium"
            onClick={() => onScanModeChange("personal")}
          >
            Personal Scan
          </Button>
          <Button
            size="sm"
            variant={scanMode === "team" ? "default" : "ghost"}
            className="h-8 px-4 text-xs font-medium"
            onClick={() => onScanModeChange("team")}
          >
            Team Scan
          </Button>
        </div>

        {scanMode === "team" && !isViewerOnly && (
          <Select value={selectedTeamId} onValueChange={onTeamChange}>
            <SelectTrigger className="w-[280px] h-9 bg-muted/50 border-border/50 text-sm">
              <SelectValue placeholder="Select a team" />
            </SelectTrigger>
            <SelectContent>
              {scanableTeams.map((team) => (
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

      {/* Viewer-only info box */}
      {scanMode === "team" && isViewerOnly && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border/50">
          <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">
              You have Viewer access in your team. You cannot initiate team scans.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              You can still run Personal Scans or contact your Admin to change your role.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScanModeToggle;
