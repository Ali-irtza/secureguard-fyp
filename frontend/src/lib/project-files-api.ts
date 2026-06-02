import { apiFetch } from "@/lib/teams-api";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types — mirror the backend ProjectFileResponse schema exactly
// ---------------------------------------------------------------------------

export type FileSource = "local" | "github";

export interface ProjectFileResponse {
  id: string;
  name: string;
  size: number;
  content_type: string;
  path: string;
  url: string;
  uploaded_at: string;
  uploaded_by: string | null;
  source: FileSource;
  github_branch: string | null;
}

/** Alias used by ProjectDetail.tsx */
export type ProjectFile = ProjectFileResponse;

export interface ProjectFileListResponse {
  files: ProjectFileResponse[];
}

export interface ProjectFileDeleteResponse {
  deleted: string; // filename that was removed
}

export interface ProjectSourceFile {
  name: string;
  content: string;
}

export interface ProjectSourceFilesResponse {
  files: ProjectSourceFile[];
}

export interface GitHubImportRequest {
  branch: string;
  file_path: string;
}

// ---------------------------------------------------------------------------
// Allowed extensions per language — mirrors backend ALLOWED_EXTENSIONS
// ---------------------------------------------------------------------------

const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  C:   [".c", ".h"],
  "C++": [".cpp", ".cxx", ".cc", ".hpp", ".hxx", ".h"],
};

/**
 * Returns true if the given filename has an extension allowed for the
 * project's language. Pass `null` / `undefined` to skip the check (allow all).
 */
export function isFileAllowed(filename: string, language: string | null | undefined): boolean {
  if (!language) return true;
  const allowed = ALLOWED_EXTENSIONS[language];
  if (!allowed) return true;
  const ext = "." + filename.split(".").pop()?.toLowerCase();
  return allowed.includes(ext);
}

/**
 * Returns an `accept` string suitable for an <input type="file"> element,
 * e.g. ".c,.h" for C projects.
 */
export function getAcceptString(language: string | null | undefined): string {
  if (!language) return ".c,.h,.cpp,.cxx,.cc,.hpp,.hxx,.h";
  const allowed = ALLOWED_EXTENSIONS[language];
  return allowed ? allowed.join(",") : ".c,.h,.cpp,.cxx,.cc,.hpp,.hxx,.h";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format bytes into a human-readable string, e.g. "4.2 KB", "1.1 MB" */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format an ISO timestamp into a relative time string, e.g. "2 hours ago" */
export function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`;

  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * GET /projects/:projectId/files
 * Returns all files attached to the given project.
 */
export async function listProjectFiles(
  projectId: string
): Promise<ProjectFileResponse[]> {
  const res = await apiFetch<ProjectFileListResponse>(
    `/projects/${projectId}/files`
  );
  return res.files;
}

export async function listProjectSourceFiles(
  projectId: string
): Promise<ProjectSourceFile[]> {
  const res = await apiFetch<ProjectSourceFilesResponse>(
    `/projects/${projectId}/source-files`
  );
  return res.files;
}

/**
 * POST /projects/:projectId/files
 * Uploads a single file to the project via multipart/form-data.
 * Note: bypasses apiFetch because we must NOT set Content-Type (browser sets it with boundary).
 */
export async function uploadProjectFile(
  projectId: string,
  file: File
): Promise<ProjectFileResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error("Not authenticated");

  const API_BASE =
    (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000";

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/projects/${projectId}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      // Do NOT set Content-Type — browser sets it automatically with the multipart boundary
    },
    body: formData,
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(
      (json as { detail?: string }).detail ?? `Upload failed: ${res.status}`
    );
  }

  return res.json() as Promise<ProjectFileResponse>;
}

/**
 * DELETE /projects/:projectId/files/:filename
 * Removes a single file from the project. Owner only.
 */
export async function deleteProjectFile(
  projectId: string,
  filename: string
): Promise<ProjectFileDeleteResponse> {
  return apiFetch<ProjectFileDeleteResponse>(
    `/projects/${projectId}/files/${encodeURIComponent(filename)}`,
    { method: "DELETE" }
  );
}

/**
 * POST /projects/:projectId/files/github-import
 * Imports a single file from the team's connected GitHub repository.
 */
export async function importGithubFile(
  projectId: string,
  body: GitHubImportRequest
): Promise<ProjectFileResponse> {
  return apiFetch<ProjectFileResponse>(
    `/projects/${projectId}/files/github-import`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}
