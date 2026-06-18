import { useEffect, useMemo, useState } from "react";
import { FileText, Calendar, Download, Trash2, FileBarChart, CheckCircle2, Users, Loader2, Code2 } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { toast } from "sonner";
import { deleteReport, downloadReport, downloadReportCode, listReports, ReportItem } from "@/lib/scans-api";

const REPORTS_PER_PAGE = 10;

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
  const [reportTypeFilter, setReportTypeFilter] = useState<"all" | "personal" | "team">("all");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyReportDownloadId, setBusyReportDownloadId] = useState<string | null>(null);
  const [busyCodeDownloadId, setBusyCodeDownloadId] = useState<string | null>(null);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

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

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / REPORTS_PER_PAGE));
  const paginatedReports = useMemo(() => {
    const start = (currentPage - 1) * REPORTS_PER_PAGE;
    return filteredReports.slice(start, start + REPORTS_PER_PAGE);
  }, [currentPage, filteredReports]);

  useEffect(() => {
    setCurrentPage(1);
  }, [reportTypeFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const stats = useMemo(() => {
    return [
      { label: "Total Reports", value: String(filteredReports.length), icon: FileText },
      { label: "This Month", value: String(filteredReports.filter((r) => isThisMonth(r.created_at)).length), icon: Calendar },
      { label: "Team Reports", value: "0", icon: Users },
      { label: "Stored Files", value: String(filteredReports.filter((r) => r.file_path || r.scan_id).length), icon: FileBarChart },
    ];
  }, [filteredReports]);

  const handleDownload = async (report: ReportItem, format: "pdf" | "csv") => {
    setBusyReportDownloadId(report.id);
    try {
      await downloadReport(report, format);
      toast.success(`${format.toUpperCase()} download started`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setBusyReportDownloadId(null);
    }
  };

  const handleDownloadCode = async (report: ReportItem) => {
    setBusyCodeDownloadId(report.id);
    try {
      await downloadReportCode(report);
      toast.success("Code ZIP download started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Code download failed");
    } finally {
      setBusyCodeDownloadId(null);
    }
  };

  const handleDelete = async (report: ReportItem) => {
    const confirmed = window.confirm(
      `Delete "${report.name}"? This removes only the generated report file. The scan history stays available.`
    );
    if (!confirmed) return;
    setBusyDeleteId(report.id);
    try {
      await deleteReport(report.id);
      setReports((current) =>
        current.filter((item) => item.id !== report.id)
      );
      toast.success("Report deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusyDeleteId(null);
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
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Report</TableHead>
                    <TableHead className="text-center">Code</TableHead>
                    <TableHead className="text-center">Delete</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedReports.map((report) => {
                    const scan = report.scans;
                    const reportBusy = busyReportDownloadId === report.id;
                    const codeBusy = busyCodeDownloadId === report.id;
                    const deleteBusy = busyDeleteId === report.id;
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
                          <div className="flex items-center gap-2 text-primary">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-sm capitalize">{report.status}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={reportBusy || (!report.file_path && !report.scan_id)}
                                className="h-8 w-8"
                                title="Download report"
                              >
                                {reportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center">
                              <DropdownMenuItem onClick={() => handleDownload(report, "pdf")}>
                                Download PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownload(report, "csv")}>
                                Download CSV
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownloadCode(report)}
                            disabled={codeBusy || !report.scan_id}
                            className="h-8 w-8"
                            title="Download input and corrected code ZIP"
                          >
                            {codeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Code2 className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(report)}
                            disabled={deleteBusy}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Delete report and linked scan"
                          >
                            {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {!loading && filteredReports.length > REPORTS_PER_PAGE && (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * REPORTS_PER_PAGE + 1}-{Math.min(currentPage * REPORTS_PER_PAGE, filteredReports.length)} of {filteredReports.length}
                </p>
                <Pagination className="mx-0 w-auto justify-start sm:justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                    </PaginationItem>
                    <PaginationItem>
                      <span className="px-3 text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
