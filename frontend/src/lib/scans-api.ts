import { apiFetch } from "@/lib/teams-api";

// ---------------------------------------------------------------------------
// Types — mirror the backend Pydantic response schemas exactly
// ---------------------------------------------------------------------------

export interface VulnerabilityDetail {
  cwe_id: string;
  cwe_name: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  line_number: number;
  absolute_line: number;
  location: string;
  description: string;
  fix_suggestion: string;
  affected_code: string;
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
  corrected_code: string;
  files: Array<{
    filename: string;
    language: string;
    corrected_code: string;
    static_findings: string;
    corrected_code_is_clean: boolean;
    chunk_outputs?: ChunkOutput[];
  }>;
  chunk_outputs?: ChunkOutput[];
  scan_id?: string | null;
}

export interface ChunkOutput {
  file_path?: string;
  chunk_index: number;
  chunk_name: string;
  chunk_kind: string;
  start_line: number;
  end_line: number;
  summary?: string;
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
  report_storage_path?: string | null;
  report_expires_at?: string | null;
  corrected_code?: string | null;
  chunk_outputs?: ChunkOutput[] | null;
  severity_counts?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  critical_findings?: Array<{
    id: string;
    severity: string;
    cwe_id: string | null;
    cwe_name: string | null;
    type: string | null;
    line_number: number | null;
    file_path: string | null;
    description: string;
    created_at: string;
  }>;
}

export interface StoredVulnerability {
  id: string;
  scan_id: string;
  severity: string;
  type: string;
  cwe_id: string | null;
  cwe_name: string | null;
  line_number: number | null;
  absolute_line: number | null;
  description: string;
  fix_suggestion: string | null;
  function_name: string | null;
  file_path: string | null;
  code_snippet: string | null;
  location?: string | null;
  created_at: string;
}

export interface ScanDetailResult {
  scan: ScanHistoryItem;
  vulnerabilities: StoredVulnerability[];
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

export async function triggerUploadedFileScan(
  files: File[],
  extra?: { project_id?: string; project_name?: string }
): Promise<ScanResult> {
  const { supabase } = await import("@/lib/supabase");
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error("Not authenticated");

  const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.append("project_id", extra?.project_id ?? "");
  formData.append("project_name", extra?.project_name ?? "");

  const response = await fetch(`${API_BASE}/scan/upload-files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json.detail ?? `Scan failed: ${response.status}`);
  }

  return response.json() as Promise<ScanResult>;
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

export async function getScanReportPdf(scanId: string): Promise<Blob> {
  const { supabase } = await import("@/lib/supabase");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
  const response = await fetch(`${API_BASE}/scans/${scanId}/report-pdf`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json.detail ?? `Report download failed: ${response.status}`);
  }
  return response.blob();
}
