import { apiFetch } from "@/lib/teams-api";

// ---------------------------------------------------------------------------
// Types — mirror the backend Pydantic response schemas exactly
// ---------------------------------------------------------------------------

export interface VulnerabilityDetail {
  cwe_id: string;
  cwe_name: string;
  severity: "Critical" | "High" | "Medium";
  line_number: number;
  absolute_line: number;
  description: string;
  fix_suggestion: string;
  function_name: string;
  file_path: string;
}

export interface FileSummary {
  file_path: string;
  chunks_scanned: number;
  vulnerabilities_found: number;
  risk_level: string;
}

export interface ScanResult {
  status: string;
  total_vulnerabilities: number;
  overall_risk_level: string;
  overall_risk_score: number;
  files_analyzed: number;
  total_chunks_scanned: number;
  files_summary: FileSummary[];
  vulnerabilities: VulnerabilityDetail[];
}

export interface BranchFilesResponse {
  files: string[];
}

export interface ScanHistoryItem {
  id: string;
  project_id: string | null;
  project_name: string | null;
  scan_type: string | null;
  file_name: string | null;
  branch: string | null;
  status: string;
  risk_level: string | null;
  risk_score: number | null;
  total_vulns: number | null;
  files_scanned: number | null;
  duration_secs: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ScanDetailResult extends ScanHistoryItem {
  vulnerabilities: VulnerabilityDetail[];
}

// ---------------------------------------------------------------------------
// Scans API
// ---------------------------------------------------------------------------

/**
 * GET /teams/:teamId/github/files?branch=:branch
 * Returns the list of C/C++ file paths available in the given branch.
 */
export async function getBranchFiles(
  teamId: string,
  branch: string
): Promise<string[]> {
  const response = await apiFetch<BranchFilesResponse>(
    `/teams/${teamId}/github/files?branch=${encodeURIComponent(branch)}`
  );
  return response.files;
}

/**
 * POST /teams/:teamId/scans
 * Triggers an AI vulnerability scan on the selected files in the given branch.
 * Returns the full scan result including all vulnerabilities and risk summary.
 */
export async function triggerScan(
  teamId: string,
  branch: string,
  selectedFiles: string[],
  extra?: { project_id?: string; project_name?: string }
): Promise<ScanResult> {
  return apiFetch<ScanResult>(`/teams/${teamId}/scans`, {
    method: "POST",
    body: JSON.stringify({
      branch,
      selected_files: selectedFiles,
      project_id: extra?.project_id ?? "",
      project_name: extra?.project_name ?? "",
    }),
  });
}

/**
 * GET /scans/history
 * Returns all past scans for the current authenticated user.
 */
export async function getScanHistory(): Promise<ScanHistoryItem[]> {
  return apiFetch<ScanHistoryItem[]>("/scans/history");
}

/**
 * GET /scans/:scanId
 * Returns a single scan with its full vulnerability list.
 */
export async function getScanDetail(scanId: string): Promise<ScanDetailResult> {
  return apiFetch<ScanDetailResult>(`/scans/${scanId}`);
}
