import { useState } from "react";
import { FileText, Calendar, Download, Trash2, Share2, Plus, Clock, FileBarChart, CheckCircle2 } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import GenerateReportDialog from "@/components/dashboard/GenerateReportDialog";
import { toast } from "sonner";

const summaryStats = [
  { label: "Total Reports", value: "47", icon: FileText },
  { label: "This Month", value: "8", icon: Calendar },
  { label: "Scheduled", value: "3", icon: Clock },
  { label: "Storage Used", value: "124 MB", icon: FileBarChart },
];


const recentReports = [
  { id: 1, name: "Weekly Security Summary", type: "Executive Summary", date: "Dec 9, 2024", status: "completed", format: "PDF" },
  { id: 2, name: "Project Alpha Audit", type: "Full Audit", date: "Dec 8, 2024", status: "completed", format: "PDF" },
  { id: 3, name: "Dependencies Analysis", type: "Vulnerability Trends", date: "Dec 7, 2024", status: "completed", format: "CSV" },
  { id: 4, name: "Monthly Compliance", type: "Compliance Report", date: "Dec 1, 2024", status: "completed", format: "PDF" },
];

const scheduledReports = [
  { id: 1, name: "Weekly Project Summary", schedule: "Every Monday at 9:00 AM", nextRun: "Dec 16, 2024" },
  { id: 2, name: "Monthly Security Audit", schedule: "1st of each month", nextRun: "Jan 1, 2025" },
  { id: 3, name: "Quarterly Compliance", schedule: "Every 3 months", nextRun: "Mar 1, 2025" },
];

const Reports = () => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleDownload = (name: string) => {
    toast.success(`Downloading ${name}...`);
  };

  const handleDelete = (name: string) => {
    toast.success(`Report "${name}" deleted`);
  };

  const handleShare = (name: string) => {
    toast.success(`Share link copied for ${name}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Reports</h1>
            <p className="text-muted-foreground mt-1">
              Generate and manage security reports
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2 glow-emerald">
            <Plus className="h-4 w-4" />
            Generate Report
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryStats.map((stat) => (
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


        {/* Recent Reports Table */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
            <CardDescription>Your generated reports from the past 30 days</CardDescription>
          </CardHeader>
          <CardContent>
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
                {recentReports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.name}</TableCell>
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
                      <div className="flex justify-end gap-1">
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
          </CardContent>
        </Card>

        {/* Scheduled Reports */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Scheduled Reports
            </CardTitle>
            <CardDescription>Automatically generated reports on a recurring basis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {scheduledReports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-background/30 border border-border/30"
                >
                  <div>
                    <p className="font-medium text-foreground">{report.name}</p>
                    <p className="text-sm text-muted-foreground">{report.schedule}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Next run</p>
                    <p className="font-medium text-foreground">{report.nextRun}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <GenerateReportDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </DashboardLayout>
  );
};

export default Reports;
