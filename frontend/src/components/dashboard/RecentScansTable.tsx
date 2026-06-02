import { FileText, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  status: "completed" | "failed";
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
  if (status === "completed") {
    return (
      <Badge className="flex items-center gap-1.5 bg-emerald/20 text-emerald hover:bg-emerald/30 border border-emerald/40">
        <span className="w-2 h-2 rounded-full bg-emerald"></span>
        Completed
      </Badge>
    );
  }
  return (
    <Badge className="flex items-center gap-1.5 bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/40">
      <span className="w-2 h-2 rounded-full bg-destructive animate-pulse"></span>
      Failed
    </Badge>
  );
};

const VulnerabilityBadge = ({ level, count }: { level: "critical" | "high" | "medium" | "low"; count: number }) => {
  const styles = {
    critical: "bg-red-500/20 text-red-400 border border-red-500/40",
    high: "bg-orange-500/20 text-orange-400 border border-orange-500/40",
    medium: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40",
    low: "bg-blue-500/20 text-blue-400 border border-blue-500/40",
  };

  const labels = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
  };

  return (
    <span className={`text-xs px-3 py-1 rounded-full font-semibold transition-all duration-200 hover:scale-105 ${styles[level]}`}>
      {count} {labels[level]}
    </span>
  );
};

const RecentScansTable = ({ scans, userRole }: RecentScansTableProps) => {
  const navigate = useNavigate();
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="glass-card overflow-hidden animate-fade-in border border-cyan-500/20">
      <div className="p-6 border-b border-cyan-500/20 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Recent Scans</h3>
            <p className="text-xs text-cyan-400/70">Overview of your most recent security scans</p>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-cyan-500/20 hover:bg-transparent bg-cyan-500/5">
              <TableHead className="text-cyan-400 font-semibold">Project</TableHead>
              <TableHead className="text-cyan-400 font-semibold">Date</TableHead>
              <TableHead className="text-cyan-400 font-semibold">Status</TableHead>
              <TableHead className="text-cyan-400 font-semibold">Vulnerabilities</TableHead>
              <TableHead className="text-cyan-400 font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scans.map((scan, index) => (
              <TableRow
                key={scan.id}
                className={`border-cyan-500/20 transition-all duration-300 hover:bg-cyan-500/10 hover:border-cyan-500/40 animate-slide-up stagger-${Math.min(index + 1, 5)} group cursor-pointer`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <TableCell className="font-semibold text-white group-hover:text-cyan-300 transition-colors duration-200">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400/60 group-hover:text-cyan-400 transition-colors" />
                    {scan.projectName}
                  </div>
                </TableCell>
                <TableCell className="text-gray-300 group-hover:text-gray-200 transition-colors duration-200">
                  {formatDate(scan.date)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={scan.status} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 flex-wrap">
                    {scan.vulnerabilities.critical > 0 && (
                      <VulnerabilityBadge level="critical" count={scan.vulnerabilities.critical} />
                    )}
                    {scan.vulnerabilities.high > 0 && (
                      <VulnerabilityBadge level="high" count={scan.vulnerabilities.high} />
                    )}
                    {scan.vulnerabilities.critical === 0 && scan.vulnerabilities.high === 0 && (
                      <span className="text-xs text-gray-400 px-2 py-1">
                        {scan.vulnerabilities.medium + scan.vulnerabilities.low} Issue{scan.vulnerabilities.medium + scan.vulnerabilities.low !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {scan.status === "completed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/15 font-semibold group/btn transition-all duration-200 border border-cyan-500/30 hover:border-cyan-500/60"
                      onClick={() => navigate(`/reports/${scan.id}`)}
                    >
                      <FileText className="h-4 w-4 mr-2 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
                      View Report
                      <span className="ml-1 transition-transform duration-200 group-hover/btn:translate-x-1">→</span>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default RecentScansTable;
