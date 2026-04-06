import { useState, useMemo } from "react";
import { CalendarIcon, FileText } from "lucide-react";
import { format as formatDate } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { mockTeams, CURRENT_USER_ID } from "@/lib/team-data";

interface GenerateReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scanTypeFilter: "all" | "personal" | "team";
  selectedTeamId: string;
}

const personalProjects = [
  { id: "p1", name: "Project Alpha" },
  { id: "p2", name: "Project Beta" },
  { id: "p3", name: "API Gateway" },
  { id: "p4", name: "Mobile App" },
];

const GenerateReportDialog = ({ open, onOpenChange, scanTypeFilter, selectedTeamId }: GenerateReportDialogProps) => {
  const [reportType, setReportType] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [format, setFormat] = useState("pdf");

  const userTeams = mockTeams.filter((t) => t.members.some((m) => m.id === CURRENT_USER_ID));
  const hasTeams = userTeams.length > 0;
  const selectedTeam = userTeams.find((t) => t.id === selectedTeamId);
  const isAdmin = selectedTeam?.currentUserRole === "admin";
  const isTeamMode = scanTypeFilter === "team" && hasTeams;

  const projects = useMemo(() => {
    if (isTeamMode && selectedTeam) {
      const uniqueProjects = [...new Set(selectedTeam.scans.map((s) => s.projectName))];
      return uniqueProjects.map((name, i) => ({ id: `tp-${i}`, name }));
    }
    return personalProjects;
  }, [isTeamMode, selectedTeam]);

  const canGenerate = reportType !== "" && selectedProject !== "";

  const handleGenerate = () => {
    if (!canGenerate) return;
    toast.success("Report generation started. You'll be notified when it's ready.");
    setReportType("");
    setSelectedProject("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col bg-card border-border overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Generate New Report
          </DialogTitle>
          <DialogDescription>
            Configure and generate your security report
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 min-h-0">
          <div className="space-y-6 py-4">
            {/* Report Type */}
            <div className="space-y-2">
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">
                    <div>
                      <span>Full Scan Report</span>
                      <p className="text-xs text-muted-foreground">Complete vulnerability details for selected project</p>
                    </div>
                  </SelectItem>
                  {hasTeams && isAdmin && (
                    <SelectItem value="team-summary">
                      <div>
                        <span>Team Summary Report</span>
                        <p className="text-xs text-muted-foreground">High level overview of all team members' scan results</p>
                      </div>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Project */}
            <div className="space-y-2">
              <Label>Select Project</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal bg-background/50",
                      !dateRange.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {formatDate(dateRange.from, "LLL dd, y")} - {formatDate(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        formatDate(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      "Pick a date range"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                    numberOfMonths={2}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Format */}
            <div className="space-y-2">
              <Label>Export Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="both">Both PDF & CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 pt-4 border-t border-border/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={!canGenerate} className="gap-2">
            Generate Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateReportDialog;
