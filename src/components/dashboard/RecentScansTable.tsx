import { FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface Scan {
  id: string;
  projectName: string;
  date: Date;
  status: "completed" | "failed" | "in_progress";
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  memberId?: string;
}

interface RecentScansTableProps {
  scans: Scan[];
  userRole?: "admin" | "developer" | "viewer";
}

const StatusBadge = ({ status }: { status: Scan["status"] }) => {
  const styles = {
    completed: "badge-low",
    failed: "badge-critical",
    in_progress: "badge-medium",
  };

  const labels = {
    completed: "Completed",
    failed: "Failed",
    in_progress: "In Progress",
  };

  return (
    <Badge className={`${styles[status]} flex items-center gap-1.5`}>
      {status === "in_progress" && <Loader2 className="h-3 w-3 animate-spin" />}
      {labels[status]}
    </Badge>
  );
};

const RecentScansTable = ({ scans }: RecentScansTableProps) => {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      <div className="p-6 border-b border-border/50">
        <h3 className="text-lg font-semibold text-foreground">Recent Scans</h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead className="text-muted-foreground">Project</TableHead>
            <TableHead className="text-muted-foreground">Date</TableHead>
            <TableHead className="text-muted-foreground">Status</TableHead>
            <TableHead className="text-muted-foreground">Vulnerabilities</TableHead>
            <TableHead className="text-muted-foreground text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scans.map((scan, index) => (
            <TableRow
              key={scan.id}
              className={`border-border/50 transition-all duration-200 hover:bg-muted/40 hover:pl-2 animate-slide-up stagger-${Math.min(index + 1, 5)}`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <TableCell className="font-medium text-foreground transition-all duration-200">
                {scan.projectName}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(scan.date)}
              </TableCell>
              <TableCell>
                <StatusBadge status={scan.status} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {scan.vulnerabilities.critical > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive font-medium transition-transform duration-200 hover:scale-105">
                      {scan.vulnerabilities.critical} Critical
                    </span>
                  )}
                  {scan.vulnerabilities.high > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning font-medium transition-transform duration-200 hover:scale-105">
                      {scan.vulnerabilities.high} High
                    </span>
                  )}
                  {scan.vulnerabilities.critical === 0 && scan.vulnerabilities.high === 0 && (
                    <span className="text-xs text-muted-foreground">
                      {scan.vulnerabilities.medium + scan.vulnerabilities.low} Issues
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-emerald hover:text-emerald-glow hover:bg-emerald/10 font-medium group"
                >
                  <FileText className="h-4 w-4 mr-1.5 transition-transform duration-200 group-hover:scale-110" />
                  View Report
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default RecentScansTable;
