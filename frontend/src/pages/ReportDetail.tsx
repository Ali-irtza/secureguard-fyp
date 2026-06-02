import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getScanDetail, getScanReportPdf } from "@/lib/scans-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { StoredVulnerability } from "@/lib/scans-api";

const severityClass = (severity: string) =>
  cn(
    severity === "critical" && "bg-red-500/15 text-red-300 border-red-500/30",
    severity === "high" && "bg-orange-500/15 text-orange-300 border-orange-500/30",
    severity === "medium" && "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    severity === "low" && "bg-blue-500/15 text-blue-300 border-blue-500/30"
  );

const splitSourceLines = (source: string): string[] => {
  const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.length > 0 ? lines : [""];
};

const NumberedCodeBlock = ({
  code,
  startLine = 1,
  emptyText = "No code returned.",
}: {
  code?: string | null;
  startLine?: number | null;
  emptyText?: string;
}) => {
  const lines = splitSourceLines(code?.trimEnd() ? code : emptyText);
  const firstLine = startLine || 1;
  return (
    <div className="mt-2 max-h-[420px] overflow-auto rounded-md border border-border/50 bg-[#0d1117] text-sm leading-relaxed text-foreground">
      <table className="w-full border-collapse font-mono">
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${index}-${line}`}>
              <td className="w-10 min-w-10 max-w-10 select-none border-r border-white/10 bg-white/[0.03] px-2 py-0.5 text-right align-top text-xs text-muted-foreground">
                {firstLine + index}
              </td>
              <td className="whitespace-pre px-4 py-0.5 align-top">{line || " "}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const sourceLineForVulnerability = (
  sourceFiles: Array<{ filename: string; source_code: string }>,
  vulnerability: StoredVulnerability
): string => {
  const filename = vulnerability.file_path || "";
  const source = sourceFiles.find((file) => file.filename === filename || filename.endsWith(file.filename));
  const lineNumber = vulnerability.line_number || vulnerability.absolute_line || 0;
  if (!source || lineNumber <= 0) return "";
  return splitSourceLines(source.source_code)[lineNumber - 1] ?? "";
};

const codeForVulnerability = (
  sourceFiles: Array<{ filename: string; source_code: string }>,
  vulnerability: StoredVulnerability
): string => {
  const snippet = vulnerability.code_snippet?.trim();
  if (snippet) return snippet;
  return sourceLineForVulnerability(sourceFiles, vulnerability).trim() || `Line ${vulnerability.line_number || vulnerability.absolute_line || "N/A"}`;
};

const ReportDetail = () => {
  const { scanId } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["scan-detail", scanId],
    queryFn: () => getScanDetail(scanId!),
    enabled: !!scanId,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Loading report...</p>
      </DashboardLayout>
    );
  }

  if (isError || !data) {
    return (
      <DashboardLayout>
        <Card className="p-6 bg-card/70 border-destructive/40">
          <p className="text-destructive">Report could not be loaded.</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate("/scan-history")}>
            Back to Scan History
          </Button>
        </Card>
      </DashboardLayout>
    );
  }

  const { scan, vulnerabilities, source_files = [] } = data;
  const expiresAt = scan.report_expires_at ? new Date(scan.report_expires_at) : null;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate("/scan-history")}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Scan History
            </Button>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Vulnerability Report
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {scan.project_name || "Project"} · reports are saved for 5 days only
              {expiresAt ? `, until ${expiresAt.toLocaleString()}` : ""}
            </p>
          </div>
          <Badge variant="outline" className="capitalize">
            {scan.status}
          </Badge>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const blob = await getScanReportPdf(scan.id);
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank");
                setTimeout(() => URL.revokeObjectURL(url), 10_000);
              } catch (error: any) {
                toast.error(error.message || "Report PDF is not available.");
              }
            }}
          >
            Open PDF
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card className="p-4 bg-card/70 border-border/50">
            <p className="text-xs text-muted-foreground">Risk</p>
            <p className="text-xl font-semibold mt-1">{scan.risk_level || "Unknown"}</p>
          </Card>
          <Card className="p-4 bg-card/70 border-border/50">
            <p className="text-xs text-muted-foreground">Vulnerabilities</p>
            <p className="text-xl font-semibold mt-1">{scan.total_vulns ?? vulnerabilities.length}</p>
          </Card>
          <Card className="p-4 bg-card/70 border-border/50">
            <p className="text-xs text-muted-foreground">Files</p>
            <p className="text-xl font-semibold mt-1">{scan.files_scanned ?? 0}</p>
          </Card>
          <Card className="p-4 bg-card/70 border-border/50">
            <p className="text-xs text-muted-foreground">Score</p>
            <p className="text-xl font-semibold mt-1">{scan.risk_score ?? 0}</p>
          </Card>
        </div>

        <Card className="bg-card/70 border-border/50 overflow-hidden">
          <div className="p-4 border-b border-border/50">
            <h2 className="text-lg font-semibold">Issues</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Each issue shows the line, affected code, vulnerability explanation, and fix.
            </p>
          </div>
          <div className="divide-y divide-border/40">
            {vulnerabilities.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No vulnerabilities were saved for this scan.</p>
            ) : (
              vulnerabilities.map((vulnerability, index) => (
                <section key={vulnerability.id} className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">Issue {index + 1}</span>
                    <Badge variant="outline" className={severityClass(vulnerability.severity)}>
                      {vulnerability.severity}
                    </Badge>
                    <span className="font-semibold">{vulnerability.cwe_id || vulnerability.type}</span>
                    {vulnerability.cwe_name && vulnerability.cwe_name !== vulnerability.cwe_id && vulnerability.cwe_name !== vulnerability.type && (
                      <span className="text-sm text-muted-foreground">{vulnerability.cwe_name}</span>
                    )}
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">File</p>
                      <p className="mt-1 text-sm font-medium">
                        {vulnerability.file_path || scan.file_name || "source"}
                      </p>
                      {vulnerability.location && (
                        <p className="mt-1 text-xs text-muted-foreground">{vulnerability.location}</p>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Code at this line</p>
                        <NumberedCodeBlock
                          code={codeForVulnerability(source_files, vulnerability)}
                          startLine={vulnerability.line_number || vulnerability.absolute_line || 1}
                        />
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What is vulnerable here</p>
                        <p className="mt-1 text-sm">{vulnerability.description}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended fix</p>
                        <p className="mt-1 text-sm">{vulnerability.fix_suggestion || "Review and replace the unsafe operation with a bounded alternative."}</p>
                      </div>
                    </div>
                  </div>
                </section>
              ))
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ReportDetail;
