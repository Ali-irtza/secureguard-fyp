import { useEffect, useState } from "react";
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
import { listProjects, Project } from "@/lib/projects-api";
import { generateReport } from "@/lib/scans-api";

interface GenerateReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scanTypeFilter: "all" | "personal" | "team";
  selectedTeamId: string;
  onGenerated?: () => void;
}

const GenerateReportDialog = ({ open, onOpenChange, onGenerated }: GenerateReportDialogProps) => {
  const [reportType, setReportType] = useState("full");
  const [selectedProject, setSelectedProject] = useState("");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [format, setFormat] = useState("pdf");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingProjects(true);
    listProjects()
      .then((items) => setProjects(items))
      .catch((error) => toast.error(error.message || "Failed to load projects"))
      .finally(() => setLoadingProjects(false));
  }, [open]);

  const canGenerate = reportType !== "" && selectedProject !== "";

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      await generateReport({
        report_type: "full",
        project_id: selectedProject,
        format: format as "pdf" | "csv" | "both",
        start_date: dateRange.from?.toISOString(),
        end_date: dateRange.to?.toISOString(),
      });
      toast.success("Report generated");
      setReportType("full");
      setSelectedProject("");
      setDateRange({ from: undefined, to: undefined });
      setFormat("pdf");
      onGenerated?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate report");
    } finally {
      setGenerating(false);
    }
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
                </SelectContent>
              </Select>
            </div>

            {/* Project */}
            <div className="space-y-2">
              <Label>Select Project</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder={loadingProjects ? "Loading projects..." : "Select project"} />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0 ? (
                    <SelectItem value="no-projects" disabled>
                      No projects found
                    </SelectItem>
                  ) : (
                    projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))
                  )}
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
          <Button onClick={handleGenerate} disabled={!canGenerate || generating} className="gap-2">
            {generating ? "Generating..." : "Generate Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateReportDialog;
