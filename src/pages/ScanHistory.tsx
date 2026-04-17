import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { History, Search, RefreshCw, FolderKanban, Clock, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, CalendarIcon, Shield, CheckCircle2, AlertTriangle, Timer, Download, FileText, FileSpreadsheet, XCircle, Info, Crown } from "lucide-react";
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
import { mockTeams, CURRENT_USER_ID, type TeamRole } from "@/lib/team-data";

interface ScanRecord {
  id: string;
  projectName: string;
  date: Date;
  duration: number; // in seconds
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  status: "completed" | "failed" | "in_progress";
  errorMessage?: string;
  errorDetails?: string;
  type: "personal" | "team";
  teamId?: string;
  teamName?: string;
  memberName?: string;
  branch?: string;
}

type SortKey = "projectName" | "date" | "duration" | "vulnerabilities" | "status";
type SortDirection = "asc" | "desc";

const roleBadgeStyles: Record<TeamRole, string> = {
  admin: "bg-primary/20 text-primary border-primary/30",
  developer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  viewer: "bg-muted text-muted-foreground border-border",
};

const mockScanHistory: ScanRecord[] = [
  { id: "1", projectName: "E-Commerce Platform", date: new Date("2024-12-10T14:34:00"), duration: 45, vulnerabilities: { critical: 0, high: 2, medium: 5, low: 12 }, status: "completed", type: "personal" },
  { id: "2", projectName: "Banking API", date: new Date("2024-12-10T12:15:00"), duration: 128, vulnerabilities: { critical: 1, high: 3, medium: 8, low: 15 }, status: "completed", type: "team", teamId: "team-1", teamName: "SecureGuard Team", memberName: "Ali Hassan", branch: "feature/login" },
  { id: "3", projectName: "Healthcare Portal", date: new Date("2024-12-10T10:00:00"), duration: 0, vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }, status: "in_progress", type: "personal" },
  { id: "4", projectName: "Mobile Backend", date: new Date("2024-12-09T18:45:00"), duration: 67, vulnerabilities: { critical: 0, high: 1, medium: 3, low: 8 }, status: "completed", type: "team", teamId: "team-2", teamName: "Ali's Project", memberName: "Ali Raza", branch: "main" },
  { id: "5", projectName: "Legacy System", date: new Date("2024-12-09T16:20:00"), duration: 0, vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }, status: "failed", errorMessage: "Connection timeout", errorDetails: "Failed to establish connection to the target server after 30 seconds. The server may be offline or behind a firewall that blocks scanning requests. Please verify network connectivity and firewall rules.", type: "personal" },
  { id: "6", projectName: "E-Commerce Platform", date: new Date("2024-12-09T14:00:00"), duration: 52, vulnerabilities: { critical: 1, high: 4, medium: 7, low: 10 }, status: "completed", type: "team", teamId: "team-1", teamName: "SecureGuard Team", memberName: "John Doe", branch: "main" },
  { id: "7", projectName: "Data Analytics Dashboard", date: new Date("2024-12-08T22:30:00"), duration: 195, vulnerabilities: { critical: 0, high: 0, medium: 2, low: 5 }, status: "completed", type: "personal" },
  { id: "8", projectName: "Banking API", date: new Date("2024-12-08T15:45:00"), duration: 135, vulnerabilities: { critical: 2, high: 5, medium: 10, low: 18 }, status: "completed", type: "team", teamId: "team-1", teamName: "SecureGuard Team", memberName: "Sara Kim", branch: "feature/payments" },
  { id: "9", projectName: "Internal Tools", date: new Date("2024-12-08T11:20:00"), duration: 38, vulnerabilities: { critical: 0, high: 0, medium: 1, low: 3 }, status: "completed", type: "personal" },
  { id: "10", projectName: "Healthcare Portal", date: new Date("2024-12-07T20:00:00"), duration: 89, vulnerabilities: { critical: 0, high: 2, medium: 6, low: 14 }, status: "completed", type: "team", teamId: "team-1", teamName: "SecureGuard Team", memberName: "Lina Torres", branch: "hotfix/auth" },
  { id: "11", projectName: "Mobile Backend", date: new Date("2024-12-07T14:30:00"), duration: 0, vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }, status: "failed", errorMessage: "Authentication failed", errorDetails: "Unable to authenticate with the provided API credentials. The API key may have expired or been revoked. Please update your credentials in project settings and retry the scan.", type: "team", teamId: "team-2", teamName: "Ali's Project", memberName: "Noor Fatima", branch: "dev/testing" },
  { id: "12", projectName: "E-Commerce Platform", date: new Date("2024-12-06T16:45:00"), duration: 48, vulnerabilities: { critical: 0, high: 3, medium: 6, low: 11 }, status: "completed", type: "personal" },
  { id: "13", projectName: "Data Analytics Dashboard", date: new Date("2024-12-06T10:15:00"), duration: 210, vulnerabilities: { critical: 0, high: 1, medium: 4, low: 9 }, status: "completed", type: "team", teamId: "team-3", teamName: "University Group", memberName: "Prof. Ahmed", branch: "main" },
  { id: "14", projectName: "Legacy System", date: new Date("2024-12-05T18:00:00"), duration: 156, vulnerabilities: { critical: 3, high: 8, medium: 15, low: 22 }, status: "completed", type: "personal" },
  { id: "15", projectName: "Banking API", date: new Date("2024-12-05T12:30:00"), duration: 142, vulnerabilities: { critical: 1, high: 4, medium: 9, low: 16 }, status: "completed", type: "team", teamId: "team-1", teamName: "SecureGuard Team", memberName: "Ali Hassan", branch: "feature/login" },
  { id: "16", projectName: "Internal Tools", date: new Date("2024-12-04T15:20:00"), duration: 42, vulnerabilities: { critical: 0, high: 0, medium: 2, low: 4 }, status: "completed", type: "personal" },
  { id: "17", projectName: "Healthcare Portal", date: new Date("2024-12-04T09:45:00"), duration: 95, vulnerabilities: { critical: 0, high: 3, medium: 7, low: 12 }, status: "completed", type: "team", teamId: "team-2", teamName: "Ali's Project", memberName: "John Doe", branch: "feature/dashboard" },
  { id: "18", projectName: "Mobile Backend", date: new Date("2024-12-03T17:30:00"), duration: 71, vulnerabilities: { critical: 0, high: 1, medium: 4, low: 9 }, status: "completed", type: "personal" },
];

const ITEMS_PER_PAGE = 10;

const ScanHistory = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [scanTypeFilter, setScanTypeFilter] = useState<"all" | "personal" | "team">("all");
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    mockTeams.find(t => t.currentUserRole === "admin")?.id || mockTeams[0]?.id || ""
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [failureDialogOpen, setFailureDialogOpen] = useState(false);
  const [selectedFailedScan, setSelectedFailedScan] = useState<ScanRecord | null>(null);

  const userTeams = mockTeams.filter(t => t.members.some(m => m.id === CURRENT_USER_ID));
  const hasTeams = userTeams.length > 0;

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

  const getTotalVulnerabilities = (vuln: ScanRecord["vulnerabilities"]): number => {
    return vuln.critical + vuln.high + vuln.medium + vuln.low;
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

  const handleRerunScan = (e: React.MouseEvent, scan: ScanRecord) => {
    e.stopPropagation();
    toast.success(`Re-running scan for ${scan.projectName}`);
  };

  const handleViewReport = (e: React.MouseEvent, scan: ScanRecord) => {
    e.stopPropagation();
    navigate(`/reports/${scan.id}`);
  };

  const handleRowClick = (scan: ScanRecord) => {
    if (scan.status === "completed") {
      navigate(`/reports/${scan.id}`);
    }
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
    if (scanTypeFilter !== "all") filters.push(`Type: ${scanTypeFilter}`);
    if (dateRange.from) filters.push(`From: ${format(dateRange.from, "PP")}`);
    if (dateRange.to) filters.push(`To: ${format(dateRange.to, "PP")}`);
    return filters.length > 0 ? filters.join(" | ") : "None";
  };

  const exportToCSV = async () => {
    const { generateCSVWithHeader } = await import("@/lib/report-config");
    
    const headers = ["Project Name", "Date", "Duration (s)", "Critical", "High", "Medium", "Low", "Total Vulnerabilities", "Status"];
    const rows = sortedScans.map(scan => [
      scan.projectName,
      format(scan.date, "yyyy-MM-dd HH:mm:ss"),
      scan.duration.toString(),
      scan.vulnerabilities.critical.toString(),
      scan.vulnerabilities.high.toString(),
      scan.vulnerabilities.medium.toString(),
      scan.vulnerabilities.low.toString(),
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
                  ? `<span class="vuln-total">${getTotalVulnerabilities(scan.vulnerabilities)} total</span>
                     ${scan.vulnerabilities.critical > 0 ? `<span class="vuln-badge vuln-critical">${scan.vulnerabilities.critical} Critical</span>` : ""}
                     ${scan.vulnerabilities.high > 0 ? `<span class="vuln-badge vuln-high">${scan.vulnerabilities.high} High</span>` : ""}
                     ${scan.vulnerabilities.medium > 0 ? `<span class="vuln-badge vuln-medium">${scan.vulnerabilities.medium} Medium</span>` : ""}
                     ${scan.vulnerabilities.low > 0 ? `<span class="vuln-badge vuln-low">${scan.vulnerabilities.low} Low</span>` : ""}`
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

  const filteredScans = mockScanHistory.filter((scan) => {
    const matchesSearch = scan.projectName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || scan.status === statusFilter;
    const matchesDateFrom = !dateRange.from || scan.date >= dateRange.from;
    const matchesDateTo = !dateRange.to || scan.date <= new Date(dateRange.to.getTime() + 86400000);
    const matchesType = scanTypeFilter === "all" 
      || scan.type === scanTypeFilter
      || (scanTypeFilter === "team" && scan.type === "team" && scan.teamId === selectedTeamId);
    
    // When team filter is active, also filter by selected team
    if (scanTypeFilter === "team") {
      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && scan.type === "team" && scan.teamId === selectedTeamId;
    }
    
    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && (scanTypeFilter === "all" || scan.type === scanTypeFilter);
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

  // Stats computed from the filtered dataset based on scan type filter
  const stats = useMemo(() => {
    let dataSource = mockScanHistory;
    if (scanTypeFilter === "personal") {
      dataSource = mockScanHistory.filter(s => s.type === "personal");
    } else if (scanTypeFilter === "team") {
      dataSource = mockScanHistory.filter(s => s.type === "team" && s.teamId === selectedTeamId);
    }
    
    const completedScans = dataSource.filter(s => s.status === "completed");
    const totalScans = dataSource.length;
    const successRate = totalScans > 0 ? Math.round((completedScans.length / totalScans) * 100) : 0;
    const totalVulns = completedScans.reduce((acc, s) => acc + getTotalVulnerabilities(s.vulnerabilities), 0);
    const avgDuration = completedScans.length > 0 
      ? Math.round(completedScans.reduce((acc, s) => acc + s.duration, 0) / completedScans.length)
      : 0;
    return { totalScans, successRate, totalVulns, avgDuration };
  }, [scanTypeFilter, selectedTeamId]);

  const totalPages = Math.ceil(sortedScans.length / ITEMS_PER_PAGE);
  const paginatedScans = sortedScans.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const StatusBadge = ({ status }: { status: ScanRecord["status"] }) => {
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
      case "in_progress":
        return (
          <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            In Progress
          </Badge>
        );
    }
  };

  const isTeamView = scanTypeFilter === "team";

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
                  <SelectItem value="in_progress">In Progress</SelectItem>
                </SelectContent>
              </Select>

              {/* Scan Type Filter */}
              <Select
                value={scanTypeFilter}
                onValueChange={(value: "all" | "personal" | "team") => {
                  setScanTypeFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px] bg-background/50 border-border/50">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scans</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  {hasTeams && <SelectItem value="team">Team</SelectItem>}
                </SelectContent>
              </Select>

              {/* Team Selector — visible only when Team filter is active */}
              {scanTypeFilter === "team" && hasTeams && (
                <Select value={selectedTeamId} onValueChange={(value) => {
                  setSelectedTeamId(value);
                  setCurrentPage(1);
                }}>
                  <SelectTrigger className="w-full sm:w-[260px] bg-background/50 border-border/50">
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {userTeams.map((team) => (
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
                      className="font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors text-center"
                      onClick={() => handleSort("projectName")}
                    >
                      <span className="flex items-center justify-center">
                        Project Name
                        <SortIcon columnKey="projectName" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors text-center"
                      onClick={() => handleSort("date")}
                    >
                      <span className="flex items-center justify-center">
                        Date
                        <SortIcon columnKey="date" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors text-center"
                      onClick={() => handleSort("duration")}
                    >
                      <span className="flex items-center justify-center">
                        Duration
                        <SortIcon columnKey="duration" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors text-center"
                      onClick={() => handleSort("vulnerabilities")}
                    >
                      <span className="flex items-center justify-center">
                        Vulnerabilities
                        <SortIcon columnKey="vulnerabilities" />
                      </span>
                    </TableHead>
                    <TableHead 
                      className="font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors text-center"
                      onClick={() => handleSort("status")}
                    >
                      <span className="flex items-center justify-center">
                        Status
                        <SortIcon columnKey="status" />
                      </span>
                    </TableHead>
                    <TableHead className="font-semibold text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedScans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <p className="text-muted-foreground text-sm">
                          {scanTypeFilter === "personal"
                            ? "No personal scans yet. Start a new scan to see your history here."
                            : scanTypeFilter === "team"
                            ? "No team scans found for this team yet."
                            : "No scans found. Try adjusting your search or filters."}
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
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <FolderKanban className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div>
                              <div className="flex items-center justify-center gap-2">
                                <span className="font-medium">{scan.projectName}</span>
                                {scan.type === "team" && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-primary/30">
                                    Team
                                  </Badge>
                                )}
                              </div>
                              {scan.type === "team" && scan.memberName && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {scan.memberName} · {scan.branch}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {formatDate(scan.date)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDuration(scan.duration)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {scan.status === "completed" ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="font-medium">{getTotalVulnerabilities(scan.vulnerabilities)}</span>
                              <span className="text-muted-foreground text-sm">total</span>
                              {scan.vulnerabilities.critical > 0 && (
                                <Badge variant="outline" className="ml-2 bg-red-500/10 text-red-400 border-red-500/30 text-xs">
                                  {scan.vulnerabilities.critical} critical
                                </Badge>
                              )}
                              {scan.vulnerabilities.high > 0 && (
                                <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-xs">
                                  {scan.vulnerabilities.high} high
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
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
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {scan.status === "completed" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleViewReport(e, scan)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <FileText className="h-4 w-4 mr-1.5" />
                                View Report
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleRerunScan(e, scan)}
                              disabled={scan.status === "in_progress"}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <RefreshCw className="h-4 w-4 mr-1.5" />
                              Re-run
                            </Button>
                          </div>
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
              {selectedFailedScan?.errorDetails && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-1">Details</h4>
                  <p className="text-sm text-muted-foreground bg-muted/30 px-3 py-2 rounded-md">
                    {selectedFailedScan.errorDetails}
                  </p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setFailureDialogOpen(false)}
                >
                  Close
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={(e) => {
                    if (selectedFailedScan) {
                      handleRerunScan(e, selectedFailedScan);
                      setFailureDialogOpen(false);
                    }
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry Scan
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
