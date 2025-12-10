import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, Search, RefreshCw, FolderKanban, Clock, ChevronLeft, ChevronRight } from "lucide-react";
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
import { toast } from "sonner";

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
}

const mockScanHistory: ScanRecord[] = [
  { id: "1", projectName: "E-Commerce Platform", date: new Date("2024-12-10T14:34:00"), duration: 45, vulnerabilities: { critical: 0, high: 2, medium: 5, low: 12 }, status: "completed" },
  { id: "2", projectName: "Banking API", date: new Date("2024-12-10T12:15:00"), duration: 128, vulnerabilities: { critical: 1, high: 3, medium: 8, low: 15 }, status: "completed" },
  { id: "3", projectName: "Healthcare Portal", date: new Date("2024-12-10T10:00:00"), duration: 0, vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }, status: "in_progress" },
  { id: "4", projectName: "Mobile Backend", date: new Date("2024-12-09T18:45:00"), duration: 67, vulnerabilities: { critical: 0, high: 1, medium: 3, low: 8 }, status: "completed" },
  { id: "5", projectName: "Legacy System", date: new Date("2024-12-09T16:20:00"), duration: 0, vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }, status: "failed" },
  { id: "6", projectName: "E-Commerce Platform", date: new Date("2024-12-09T14:00:00"), duration: 52, vulnerabilities: { critical: 1, high: 4, medium: 7, low: 10 }, status: "completed" },
  { id: "7", projectName: "Data Analytics Dashboard", date: new Date("2024-12-08T22:30:00"), duration: 195, vulnerabilities: { critical: 0, high: 0, medium: 2, low: 5 }, status: "completed" },
  { id: "8", projectName: "Banking API", date: new Date("2024-12-08T15:45:00"), duration: 135, vulnerabilities: { critical: 2, high: 5, medium: 10, low: 18 }, status: "completed" },
  { id: "9", projectName: "Internal Tools", date: new Date("2024-12-08T11:20:00"), duration: 38, vulnerabilities: { critical: 0, high: 0, medium: 1, low: 3 }, status: "completed" },
  { id: "10", projectName: "Healthcare Portal", date: new Date("2024-12-07T20:00:00"), duration: 89, vulnerabilities: { critical: 0, high: 2, medium: 6, low: 14 }, status: "completed" },
  { id: "11", projectName: "Mobile Backend", date: new Date("2024-12-07T14:30:00"), duration: 0, vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 }, status: "failed" },
  { id: "12", projectName: "E-Commerce Platform", date: new Date("2024-12-06T16:45:00"), duration: 48, vulnerabilities: { critical: 0, high: 3, medium: 6, low: 11 }, status: "completed" },
  { id: "13", projectName: "Data Analytics Dashboard", date: new Date("2024-12-06T10:15:00"), duration: 210, vulnerabilities: { critical: 0, high: 1, medium: 4, low: 9 }, status: "completed" },
  { id: "14", projectName: "Legacy System", date: new Date("2024-12-05T18:00:00"), duration: 156, vulnerabilities: { critical: 3, high: 8, medium: 15, low: 22 }, status: "completed" },
  { id: "15", projectName: "Banking API", date: new Date("2024-12-05T12:30:00"), duration: 142, vulnerabilities: { critical: 1, high: 4, medium: 9, low: 16 }, status: "completed" },
  { id: "16", projectName: "Internal Tools", date: new Date("2024-12-04T15:20:00"), duration: 42, vulnerabilities: { critical: 0, high: 0, medium: 2, low: 4 }, status: "completed" },
  { id: "17", projectName: "Healthcare Portal", date: new Date("2024-12-04T09:45:00"), duration: 95, vulnerabilities: { critical: 0, high: 3, medium: 7, low: 12 }, status: "completed" },
  { id: "18", projectName: "Mobile Backend", date: new Date("2024-12-03T17:30:00"), duration: 71, vulnerabilities: { critical: 0, high: 1, medium: 4, low: 9 }, status: "completed" },
];

const ITEMS_PER_PAGE = 10;

const ScanHistory = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

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

  const handleRerunScan = (e: React.MouseEvent, scan: ScanRecord) => {
    e.stopPropagation();
    toast.success(`Re-running scan for ${scan.projectName}`);
  };

  const handleRowClick = (scan: ScanRecord) => {
    if (scan.status === "completed") {
      navigate(`/reports/${scan.id}`);
    }
  };

  const filteredScans = mockScanHistory.filter((scan) => {
    const matchesSearch = scan.projectName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || scan.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredScans.length / ITEMS_PER_PAGE);
  const paginatedScans = filteredScans.slice(
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
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="bg-card/50 backdrop-blur-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">All Scans</CardTitle>
            <CardDescription>{filteredScans.length} records found</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-semibold">Project Name</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Duration</TableHead>
                    <TableHead className="font-semibold">Vulnerabilities</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedScans.map((scan) => (
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
                          <FolderKanban className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{scan.projectName}</span>
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
                      <TableCell>
                        <StatusBadge status={scan.status} />
                      </TableCell>
                      <TableCell className="text-right">
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
                      </TableCell>
                    </TableRow>
                  ))}
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
      </div>
    </DashboardLayout>
  );
};

export default ScanHistory;
