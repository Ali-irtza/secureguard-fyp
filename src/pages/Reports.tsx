import { useState, useMemo } from "react";
import {
  FileText,
  Calendar,
  Download,
  Trash2,
  Share2,
  Plus,
  FileBarChart,
  CheckCircle2,
  Users,
  Crown,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GenerateReportDialog from "@/components/dashboard/GenerateReportDialog";
import { toast } from "sonner";
import { mockTeams, CURRENT_USER_ID } from "@/lib/team-data";

interface Report {
  id: number;
  name: string;
  type: string;
  date: string;
  status: string;
  format: string;
  scanType: "personal" | "team";
  teamId?: string;
  teamName?: string;
}

const recentReports: Report[] = [
  {
    id: 1,
    name: "Weekly Security Summary",
    type: "Team Summary Report",
    date: "Dec 9, 2024",
    status: "completed",
    format: "PDF",
    scanType: "team",
    teamId: "team-1",
    teamName: "SecureGuard Team",
  },
  {
    id: 2,
    name: "Project Alpha Audit",
    type: "Full Scan Report",
    date: "Dec 8, 2024",
    status: "completed",
    format: "PDF",
    scanType: "personal",
  },
  {
    id: 3,
    name: "Dependencies Analysis",
    type: "Team Summary Report",
    date: "Dec 7, 2024",
    status: "completed",
    format: "CSV",
    scanType: "team",
    teamId: "team-2",
    teamName: "Ali's Project",
  },
  {
    id: 4,
    name: "Monthly Compliance",
    type: "Full Scan Report",
    date: "Dec 1, 2024",
    status: "completed",
    format: "PDF",
    scanType: "personal",
  },
];

const Reports = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reportTypeFilter, setReportTypeFilter] = useState<"all" | "personal" | "team">("all");

  const userTeams = mockTeams.filter((t) => t.members.some((m) => m.id === CURRENT_USER_ID));
  const hasTeams = userTeams.length > 0;

  const defaultTeamId = userTeams.find((t) => t.currentUserRole === "admin")?.id || userTeams[0]?.id || "";
  const [selectedTeamId, setSelectedTeamId] = useState(defaultTeamId);
  const selectedTeam = userTeams.find((t) => t.id === selectedTeamId);

  const filteredReports = useMemo(() => {
    if (reportTypeFilter === "personal") return recentReports.filter((r) => r.scanType === "personal");
    if (reportTypeFilter === "team")
      return recentReports.filter((r) => r.scanType === "team" && r.teamId === selectedTeamId);
    return recentReports;
  }, [reportTypeFilter, selectedTeamId]);

  const teamReportCount = recentReports.filter((r) => r.scanType === "team").length;
  const isTeamFilter = reportTypeFilter === "team";

  const stats = useMemo(() => {
    const source = filteredReports;
    return [
      { label: "Total Reports", value: String(source.length), icon: FileText },
      { label: "This Month", value: String(source.filter((r) => r.date.includes("Dec")).length), icon: Calendar },
      { label: "Team Reports", value: String(isTeamFilter ? source.length : teamReportCount), icon: Users },
      { label: "Storage Used", value: `${source.length * 3} MB`, icon: FileBarChart },
    ];
  }, [filteredReports, isTeamFilter, teamReportCount]);

  const handleDownload = (name: string) => toast.success(`Downloading ${name}...`);
  const handleDelete = (name: string) => toast.success(`Report "${name}" deleted`);
  const handleShare = (name: string) => toast.success(`Share link copied for ${name}`);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
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

        {/* Summary Stats */}
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
                  {isTeamFilter && <p className="text-[10px] text-muted-foreground">Team</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter Row */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={reportTypeFilter} onValueChange={(v) => setReportTypeFilter(v as "all" | "personal" | "team")}>
            <SelectTrigger className="w-[160px] bg-card/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reports</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
              {hasTeams && <SelectItem value="team">Team</SelectItem>}
            </SelectContent>
          </Select>

          {reportTypeFilter === "team" && hasTeams && (
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="w-[220px] bg-card/50 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {userTeams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    <div className="flex items-center gap-2">
                      {team.currentUserRole === "admin" && <Crown className="h-3 w-3 text-yellow-500" />}
                      <span>{team.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">
                        {team.currentUserRole}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Recent Reports Table */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
            <CardDescription>All your generated security reports</CardDescription>
          </CardHeader>
          <CardContent>
            {filteredReports.length === 0 ? (
              reportTypeFilter === "all" ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-1">No Reports Yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Generate your first report or complete a scan to get started
                  </p>
                  <Button onClick={() => setDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Generate Report
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-muted-foreground">
                    {reportTypeFilter === "personal"
                      ? "No personal reports yet."
                      : "No team reports found for this team yet."}
                  </p>
                </div>
              )
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-justify">Name</TableHead>
                    <TableHead className="text-justify">Type</TableHead>
                    <TableHead className="text-justify">Date</TableHead>
                    <TableHead className="text-justify">Format</TableHead>
                    <TableHead className="text-justify">Status</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{report.name}</span>
                          {report.scanType === "team" && (
                            <Badge className="bg-primary/15 text-primary border-0 text-[10px] px-1.5 py-0">Team</Badge>
                          )}
                        </div>
                        {report.scanType === "team" && report.teamName && (
                          <p className="text-xs text-muted-foreground mt-0.5">{report.teamName}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{report.type}</TableCell>
                      <TableCell className="text-muted-foreground">{report.date}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {report.format}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-primary">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm capitalize">{report.status}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(report.name)}
                            className="h-8 w-8"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleShare(report.name)}
                            className="h-8 w-8"
                          >
                            <Share2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(report.name)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
        selectedTeamId={selectedTeamId}
      />
    </DashboardLayout>
  );
};

export default Reports;
