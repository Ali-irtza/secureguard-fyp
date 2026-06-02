import { useState, useMemo } from "react";
import { getScanDetail, getScanHistory, ScanDetailResult, ScanHistoryItem, StoredVulnerability } from "@/lib/scans-api";
import { useQuery } from "@tanstack/react-query";
import { History, Search, FolderKanban, Clock, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon, Shield, CheckCircle2, AlertTriangle, Timer, Download, FileText, FileSpreadsheet, XCircle, Info, X } from "lucide-react";
import { format } from "date-fns";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SortKey = "projectName" | "date" | "duration" | "vulnerabilities" | "status";

interface ScanRecord {
  id: string;
  projectName: string;
  date: Date;
  duration: number;
  vulnerabilities: number;
  status: string;
  errorMessage?: string;
  branch?: string;
  scanType: string;
  fileName: string;
  projectId: string | null;
  riskLevel: string;
  riskScore: number;
  filesScanned: number;
  createdAt: string;
}
type SortDirection = "asc" | "desc";

const ITEMS_PER_PAGE = 10;

const ScanHistory = () => {
  const { data: rawScans = [], isLoading, isError } = useQuery({
    queryKey: ["scan-history"],
    queryFn: getScanHistory,
  });

  const scans: ScanRecord[] = rawScans
  .filter((s) => Boolean(s.project_name || s.file_name || s.branch))
  .map((s) => ({
    id: s.id,
    projectId: s.project_id,
    projectName: s.project_name || s.file_name || "Project",
    scanType: s.scan_type ?? "upload",
    fileName: s.file_name ?? s.branch ?? "—",
    branch: s.branch ?? "—",
    status: s.status === "completed" ? "completed" : "failed",
    riskLevel: s.risk_level ?? "unknown",
    riskScore: s.risk_score ?? 0,
    vulnerabilities: s.total_vulns ?? 0,
    filesScanned: s.files_scanned ?? 0,
    duration: s.duration_secs ?? 0,
    errorMessage: s.error_message ?? undefined,
    date: new Date(s.created_at),
    createdAt: s.created_at,
  }));
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [failureDialogOpen, setFailureDialogOpen] = useState(false);
  const [selectedFailedScan, setSelectedFailedScan] = useState<ScanRecord | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedHistoryScan, setSelectedHistoryScan] = useState<ScanRecord | null>(null);
  const [selectedHistoryDetail, setSelectedHistoryDetail] = useState<ScanDetailResult | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const formatDuration = (seconds: number): string => {
    if (seconds === 0) return "—";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getTotalVulnerabilities = (vuln: number): number => {
    return vuln;
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="h-3.5 w-3.5 ml-1" />
      : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
  };

  const scannedFileNames = (scan?: ScanRecord | null): string[] => {
    if (!scan?.fileName) return [];
    const placeholderFileName = scan.fileName.trim();
    if (placeholderFileName.length <= 3 && !placeholderFileName.includes(".")) return [];
    return placeholderFileName
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  };

  const openHistory = async (scan: ScanRecord) => {
    if (scan.status !== "completed") return;
    setSelectedHistoryScan(scan);
    setSelectedHistoryDetail(null);
    setHistoryDialogOpen(true);
    setHistoryLoading(true);
    try {
      const detail = await getScanDetail(scan.id);
      setSelectedHistoryDetail(detail);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load scan history details.";
      toast.error(message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleViewHistory = (e: React.MouseEvent, scan: ScanRecord) => {
    e.stopPropagation();
    void openHistory(scan);
  };

  const handleRowClick = (scan: ScanRecord) => {
    void openHistory(scan);
  };

  const handleViewFailureDetails = (e: React.MouseEvent, scan: ScanRecord) => {
    e.stopPropagation();
    setSelectedFailedScan(scan);
    setFailureDialogOpen(true);
  };

  const getFilterSummary = () => {
    const filters: string[] = [];
    if (searchQuery) filters.push(`Search: "${searchQuery}"`);
    if (statusFilter !== "all") filters.push(`Status: ${statusFilter}`);
    if (dateRange.from) filters.push(`From: ${format(dateRange.from, "PP")}`);
    if (dateRange.to) filters.push(`To: ${format(dateRange.to, "PP")}`);
    return filters.length > 0 ? filters.join(" | ") : "None";
  };

  const exportToCSV = async () => {
    const { generateCSVWithHeader } = await import("@/lib/report-config");
    
    const headers = ["Project Name", "Date", "Duration (s)", "Total Vulnerabilities", "Status"];
    const rows = sortedScans.map(scan => [
      scan.projectName,
      format(scan.date, "yyyy-MM-dd HH:mm:ss"),
      scan.duration.toString(),
      getTotalVulnerabilities(scan.vulnerabilities).toString(),
      scan.status
    ]);

    const csvContent = generateCSVWithHeader(
      headers,
      rows,
      {
        reportTitle: "Scan History Report",
        generatedAt: format(new Date(), "PPpp"),
        filterSummary: getFilterSummary(),
        recordCount: sortedScans.length,
      },
      {
        totalScans: stats.totalScans,
        successRate: stats.successRate,
        totalVulns: stats.totalVulns,
        avgDuration: formatDuration(stats.avgDuration),
      }
    );

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `secureguard-scan-history-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    toast.success("Exported branded report to CSV");
  };

  const exportToPDF = async () => {
    const { generatePDFTemplate } = await import("@/lib/report-config");
    
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to export PDF");
      return;
    }

    const tableContent = `
      <table>
        <thead>
          <tr>
            <th>Project Name</th>
            <th>Date</th>
            <th>Duration</th>
            <th>Vulnerabilities</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${sortedScans.map(scan => `
            <tr>
              <td><strong>${scan.projectName}</strong></td>
              <td>${format(scan.date, "PPp")}</td>
              <td>${formatDuration(scan.duration)}</td>
              <td>
                ${scan.status === "completed"
                  ? `<span class="vuln-total">${getTotalVulnerabilities(scan.vulnerabilities)} total</span>`
                  : "—"}
              </td>
              <td><span class="badge badge-${scan.status}">${scan.status.replace("_", " ")}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    const htmlContent = generatePDFTemplate(
      tableContent,
      "Scan History Report",
      {
        generatedAt: format(new Date(), "PPpp"),
        filterSummary: getFilterSummary(),
        recordCount: sortedScans.length,
      },
      {
        totalScans: stats.totalScans,
        successRate: stats.successRate,
        totalVulns: stats.totalVulns,
        avgDuration: formatDuration(stats.avgDuration),
      }
    );

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
    toast.success("Opening branded PDF report");
  };

  const filteredScans = scans.filter((scan) => {
    const matchesSearch = scan.projectName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || scan.status === statusFilter;
    const matchesDateFrom = !dateRange.from || scan.date >= dateRange.from;
    const matchesDateTo = !dateRange.to || scan.date <= new Date(dateRange.to.getTime() + 86400000);

    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  const sortedScans = useMemo(() => {
    return [...filteredScans].sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case "projectName":
          comparison = a.projectName.localeCompare(b.projectName);
          break;
        case "date":
          comparison = a.date.getTime() - b.date.getTime();
          break;
        case "duration":
          comparison = a.duration - b.duration;
          break;
        case "vulnerabilities":
          comparison = getTotalVulnerabilities(a.vulnerabilities) - getTotalVulnerabilities(b.vulnerabilities);
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredScans, sortKey, sortDirection]);

  // Stats computed from the full dataset
  const stats = useMemo(() => {
    const completedScans = scans.filter(s => s.status === "completed");
    const totalScans = scans.length;
    const successRate = totalScans > 0 ? Math.round((completedScans.length / totalScans) * 100) : 0;
    const totalVulns = completedScans.reduce((acc, s) => acc + getTotalVulnerabilities(s.vulnerabilities), 0);
    const avgDuration = completedScans.length > 0
      ? Math.round(completedScans.reduce((acc, s) => acc + s.duration, 0) / completedScans.length)
      : 0;
    return { totalScans, successRate, totalVulns, avgDuration };
  }, [scans]);

  const totalPages = Math.ceil(sortedScans.length / ITEMS_PER_PAGE);
  const paginatedScans = sortedScans.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20">
            Failed
          </Badge>
        );
      default:
        return (
          <Badge className="bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20">
            Failed
          </Badge>
        );
    }
  };

  const SeverityBadge = ({ severity }: { severity: string }) => {
    const normalized = severity.toLowerCase();
    const classes =
      normalized === "critical"
        ? "bg-red-500/15 text-red-300 border-red-500/35"
        : normalized === "high"
          ? "bg-orange-500/15 text-orange-300 border-orange-500/35"
          : normalized === "medium"
            ? "bg-amber-500/15 text-amber-200 border-amber-500/35"
            : "bg-emerald-500/15 text-emerald-300 border-emerald-500/35";
    return <Badge className={cn("capitalize", classes)}>{severity || "unknown"}</Badge>;
  };

  const vulnerabilityTitle = (vulnerability: StoredVulnerability): string => {
    const primary = vulnerability.cwe_id || vulnerability.type || "Finding";
    const secondary = vulnerability.cwe_name;
    if (!secondary || secondary === primary) return primary;
    return `${primary} - ${secondary}`;
  };

  const isTeamView = false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading scan history...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Failed to load scan history.</p>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <History className="h-8 w-8 text-primary" />
            Scan History
          </h1>
          <p className="text-muted-foreground mt-1">Audit log of all security scans</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card/50 backdrop-blur-xl border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.totalScans}</p>
                <p className="text-xs text-muted-foreground">Total Scans</p>
                {isTeamView && <p className="text-[10px] text-muted-foreground">Team</p>}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur-xl border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.successRate}%</p>
                <p className="text-xs text-muted-foreground">Success Rate</p>
                {isTeamView && <p className="text-[10px] text-muted-foreground">Team</p>}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur-xl border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.totalVulns}</p>
                <p className="text-xs text-muted-foreground">Vulnerabilities Found</p>
                {isTeamView && <p className="text-[10px] text-muted-foreground">Team</p>}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur-xl border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10">
                <Timer className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{formatDuration(stats.avgDuration)}</p>
                <p className="text-xs text-muted-foreground">Avg. Duration</p>
                {isTeamView && <p className="text-[10px] text-muted-foreground">Team</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-card/50 backdrop-blur-xl border-border/50">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by project name..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 bg-background/50 border-border/50"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px] bg-background/50 border-border/50">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full sm:w-[240px] justify-start text-left font-normal bg-background/50 border-border/50",
                      !dateRange.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      "Date range"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => {
                      setDateRange({ from: range?.from, to: range?.to });
                      setCurrentPage(1);
                    }}
                    numberOfMonths={2}
                  />
                  {(dateRange.from || dateRange.to) && (
                    <div className="p-3 border-t border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setDateRange({})}
                      >
                        Clear dates
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="bg-card/50 backdrop-blur-xl border-border/50">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">All Scans</CardTitle>
              <CardDescription>Reports are saved for 5 days only.</CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportToCSV} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToPDF} className="gap-2 cursor-pointer">
                  <FileText className="h-4 w-4" />
                  Export as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead 
                      className="font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors"
                      onClick={() => handleSort("projectName")}
                    >
                      <span className="flex items-center">
                        Project Name
                        <SortIcon columnKey="projectName" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors"
                      onClick={() => handleSort("date")}
                    >
                      <span className="flex items-center">
                        Date
                        <SortIcon columnKey="date" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors"
                      onClick={() => handleSort("duration")}
                    >
                      <span className="flex items-center">
                        Duration
                        <SortIcon columnKey="duration" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors"
                      onClick={() => handleSort("vulnerabilities")}
                    >
                      <span className="flex items-center">
                        Vulnerabilities
                        <SortIcon columnKey="vulnerabilities" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors"
                      onClick={() => handleSort("status")}
                    >
                      <span className="flex items-center">
                        Status
                        <SortIcon columnKey="status" />
                      </span>
                    </TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedScans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <p className="text-muted-foreground text-sm">
                          No scans found. Try adjusting your search or filters.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedScans.map((scan) => (
                      <TableRow
                        key={scan.id}
                        onClick={() => handleRowClick(scan)}
                        className={`transition-colors ${
                          scan.status === "completed"
                            ? "cursor-pointer hover:bg-muted/50"
                            : "opacity-75"
                        }`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FolderKanban className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{scan.projectName}</span>
                                {scan.scanType === "github" && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-primary/30">
                                    GitHub
                                  </Badge>
                                )}
                              </div>
                              {scan.branch && scan.branch !== "—" && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {scan.branch}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(scan.date)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDuration(scan.duration)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {scan.status === "completed" ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{getTotalVulnerabilities(scan.vulnerabilities)}</span>
                              <span className="text-muted-foreground text-sm">total</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={scan.status} />
                            {scan.status === "failed" && scan.errorMessage && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-red-400 hover:text-red-300"
                                      onClick={(e) => handleViewFailureDetails(e, scan)}
                                    >
                                      <Info className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[200px]">
                                    <p className="text-xs">{scan.errorMessage}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Click for details</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleViewHistory(e, scan)}
                            disabled={scan.status !== "completed"}
                            className={cn(
                              "text-muted-foreground hover:text-foreground",
                              scan.status !== "completed" && "cursor-not-allowed opacity-45 hover:text-muted-foreground"
                            )}
                          >
                            <FileText className="h-4 w-4 mr-1.5" />
                            History
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredScans.length)} of{" "}
                  {filteredScans.length} entries
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                    </PaginationItem>
                    <PaginationItem>
                      <span className="px-4 text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="gap-1"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
          <DialogContent
            showCloseButton={false}
            className="max-w-5xl max-h-[86vh] overflow-hidden border-primary/25 bg-background/95 p-0 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border/60 bg-muted/20 px-6 py-5">
              <div className="space-y-2">
                <DialogTitle className="flex items-center gap-3 text-2xl">
                  <History className="h-6 w-6 text-primary" />
                  History
                </DialogTitle>
                <DialogDescription>
                  {selectedHistoryScan?.projectName} - {selectedHistoryScan && formatDate(selectedHistoryScan.date)}
                </DialogDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => setHistoryDialogOpen(false)}
                aria-label="Close history"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="max-h-[calc(86vh-88px)] overflow-y-auto px-6 py-5">
              {historyLoading ? (
                <div className="flex min-h-[280px] items-center justify-center text-muted-foreground">
                  Loading history...
                </div>
              ) : selectedHistoryScan ? (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border/60 bg-card/70 p-4">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Project</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{selectedHistoryScan.projectName}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-card/70 p-4">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Files</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{selectedHistoryScan.filesScanned}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-card/70 p-4">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Vulnerabilities</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{selectedHistoryScan.vulnerabilities}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-card/60">
                    <div className="border-b border-border/60 px-4 py-3">
                      <h3 className="font-semibold">Files Scanned</h3>
                    </div>
                    <div className="flex flex-wrap gap-2 p-4">
                      {scannedFileNames(selectedHistoryScan).length > 0 ? (
                        scannedFileNames(selectedHistoryScan).map((fileName) => (
                          <Badge
                            key={fileName}
                            variant="outline"
                            className="max-w-full truncate border-border/70 bg-background/60 px-3 py-1.5 text-sm"
                            title={fileName}
                          >
                            {fileName}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No file names were recorded for this scan.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-card/60">
                    <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                      <h3 className="font-semibold">Vulnerabilities</h3>
                      <Badge variant="outline" className="border-border/70">
                        {selectedHistoryDetail?.vulnerabilities.length ?? selectedHistoryScan.vulnerabilities} total
                      </Badge>
                    </div>
                    <div className="divide-y divide-border/60">
                      {selectedHistoryDetail?.vulnerabilities?.length ? (
                        selectedHistoryDetail.vulnerabilities.map((vulnerability, index) => (
                          <div key={vulnerability.id ?? `${vulnerabilityTitle(vulnerability)}-${index}`} className="space-y-3 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-muted-foreground">Issue {index + 1}</span>
                              <SeverityBadge severity={vulnerability.severity} />
                              <span className="font-semibold text-foreground">{vulnerabilityTitle(vulnerability)}</span>
                              {vulnerability.line_number ? (
                                <span className="text-sm text-muted-foreground">line {vulnerability.line_number}</span>
                              ) : null}
                            </div>
                            <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
                              <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground">File</p>
                                <p className="mt-1 break-words text-sm text-foreground">{vulnerability.file_path || "Unknown file"}</p>
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase text-muted-foreground">What is vulnerable here</p>
                                  <p className="mt-1 text-sm text-foreground">{vulnerability.description}</p>
                                </div>
                                {vulnerability.fix_suggestion ? (
                                  <div>
                                    <p className="text-xs font-semibold uppercase text-muted-foreground">Recommended fix</p>
                                    <p className="mt-1 text-sm text-foreground">{vulnerability.fix_suggestion}</p>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-sm text-muted-foreground">
                          No vulnerability details were returned for this scan.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        {/* Failure Details Dialog */}
        <Dialog open={failureDialogOpen} onOpenChange={setFailureDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-400">
                <XCircle className="h-5 w-5" />
                Scan Failed
              </DialogTitle>
              <DialogDescription>
                {selectedFailedScan?.projectName} • {selectedFailedScan && format(selectedFailedScan.date, "PPp")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-foreground mb-1">Error</h4>
                <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-md border border-red-500/20">
                  {selectedFailedScan?.errorMessage}
                </p>
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => setFailureDialogOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ScanHistory;
