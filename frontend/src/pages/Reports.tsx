import { useEffect, useMemo, useState } from "react";
import { FileText, Calendar, Download, Trash2, Plus, FileBarChart, CheckCircle2, Users, Loader2 } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GenerateReportDialog from "@/components/dashboard/GenerateReportDialog";
import { toast } from "sonner";
import { deleteReport, downloadReport, listReports, ReportItem } from "@/lib/scans-api";

const formatDate = (value?: string | null) => {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
};

const isThisMonth = (value?: string | null) => {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

const Reports = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reportTypeFilter, setReportTypeFilter] = useState<"all" | "personal" | "team">("all");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);

  const loadReports = async () => {
    setLoading(true);
    try {
      setReports(await listReports());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const filteredReports = useMemo(() => {
    if (reportTypeFilter === "team") return [];
    return reports;
  }, [reports, reportTypeFilter]);

  const stats = useMemo(() => {
    return [
      { label: "Total Reports", value: String(filteredReports.length), icon: FileText },
      { label: "This Month", value: String(filteredReports.filter((r) => isThisMonth(r.created_at)).length), icon: Calendar },
      { label: "Team Reports", value: "0", icon: Users },
      { label: "Stored Files", value: String(filteredReports.filter((r) => r.file_path).length), icon: FileBarChart },
    ];
  }, [filteredReports]);

  const handleDownload = async (report: ReportItem) => {
    setBusyReportId(report.id);
    try {
      await downloadReport(report);
      toast.success(`${report.format.toUpperCase()} download started`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setBusyReportId(null);
    }
  };

  const handleDelete = async (report: ReportItem) => {
    const confirmed = window.confirm(
      `Delete "${report.name}"? This also removes its linked scan from Scan History and Dashboard.`
    );
    if (!confirmed) return;
    setBusyReportId(report.id);
    try {
      await deleteReport(report.id);
      setReports((current) =>
        current.filter((item) =>
          report.scan_id ? item.scan_id !== report.scan_id : item.id !== report.id
        )
      );
      toast.success("Report and linked scan removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusyReportId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Reports</h1>
            <p className="text-muted-foreground mt-1">Generate and manage security reports</p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2 glow-emerald">
            <Plus className="h-4 w-4" />
            Generate Report
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10 text-primary">
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Select value={reportTypeFilter} onValueChange={(v) => setReportTypeFilter(v as "all" | "personal" | "team")}>
            <SelectTrigger className="w-[160px] bg-card/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reports</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="team">Team Reports</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
            <CardDescription>Reports generated from your saved scan history</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading reports...
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  {reportTypeFilter === "team" ? "No Team Reports" : "No Reports Yet"}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {reportTypeFilter === "team"
                    ? "Team report generation is disabled until teams are configured."
                    : "Complete a scan or generate a report from an existing project."}
                </p>
                {reportTypeFilter !== "team" && (
                  <Button onClick={() => setDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Generate Report
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => {
                    const scan = report.scans;
                    const busy = busyReportId === report.id;
                    return (
                      <TableRow key={report.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{report.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {scan?.project_name || "Project"} · {scan?.total_vulns ?? 0} issue{(scan?.total_vulns ?? 0) === 1 ? "" : "s"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">Full Scan Report</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(report.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {report.format.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-primary">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-sm capitalize">{report.status}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(report)}
                              disabled={busy || !report.file_path}
                              className="h-8 w-8"
                              title="Download report"
                            >
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(report)}
                              disabled={busy}
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title="Delete report and linked scan"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <GenerateReportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        scanTypeFilter={reportTypeFilter}
        selectedTeamId=""
        onGenerated={loadReports}
      />
    </DashboardLayout>
  );
};

export default Reports;
