import { apiFetch } from "@/lib/teams-api";

// ---------------------------------------------------------------------------
// Types — mirror the backend Pydantic response schemas exactly
// ---------------------------------------------------------------------------

export type FileSource = "local" | "github";

export interface ProjectFile {
  id:            string;        // DB row id
  name:          string;
  size:          number;        // bytes
  content_type:  string;
  path:          string;        // storage path: {project_id}/{filename}
  url:           string;        // signed download URL (valid 1 hour)
  uploaded_at:   string;        // ISO datetime string
  uploaded_by:   string | null; // user_id of uploader
  source:        FileSource;    // "local" | "github"
  github_branch: string | null; // set only when source === "github"
}

export interface ProjectFileListResponse {
  files: ProjectFile[];
}

export interface GitHubImportPayload {
  branch:    string; // branch to import from
  file_path: string; // path within the repo, e.g. "src/main.c"
}

// ---------------------------------------------------------------------------
// Allowed extensions per language — mirrors backend ALLOWED_EXTENSIONS
// Used for the file input `accept` attribute and client-side validation.
// ---------------------------------------------------------------------------

export const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  C:     [".c", ".h"],
  "C++": [".cpp", ".cxx", ".cc", ".hpp", ".hxx", ".h"],
};

/** Returns the `accept` string for an <input type="file"> */
export function getAcceptString(language: string | null): string {
  if (!language) return "";
  return (ALLOWED_EXTENSIONS[language] ?? []).join(",");
}

/** Returns true if the filename has an allowed extension for the given language */
export function isFileAllowed(filename: string, language: string | null): boolean {
  if (!language) return false;
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return (ALLOWED_EXTENSIONS[language] ?? []).includes(ext);
}

// ---------------------------------------------------------------------------
// Project Files API
// ---------------------------------------------------------------------------

/** GET /projects/:id/files — list all files for a project */
export async function listProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const data = await apiFetch<ProjectFileListResponse>(`/projects/${projectId}/files`);
  return data.files;
}

/**
 * POST /projects/:id/files — upload a local file (multipart/form-data).
 * Uses XHR so we can track upload progress.
 */
export async function uploadProjectFile(
  projectId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ProjectFile> {
  const { supabase } = await import("@/lib/supabase");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const API_BASE = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000";

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/projects/${projectId}/files`);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.onload = () => {
      if (xhr.status === 201) {
        try { resolve(JSON.parse(xhr.responseText) as ProjectFile); }
        catch { reject(new Error("Invalid response from server")); }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail ?? `Upload failed: ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
}

/**
 * POST /projects/:id/files/github-import — import a file from GitHub.
 * Fetches from GitHub once and saves to storage, tagged source="github".
 */
export async function importGithubFile(
  projectId: string,
  payload: GitHubImportPayload,
): Promise<ProjectFile> {
  return apiFetch<ProjectFile>(`/projects/${projectId}/files/github-import`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** DELETE /projects/:id/files/:filename — delete a single file */
export async function deleteProjectFile(
  projectId: string,
  filename: string,
): Promise<{ deleted: string }> {
  return apiFetch<{ deleted: string }>(
    `/projects/${projectId}/files/${encodeURIComponent(filename)}`,
    { method: "DELETE" },
  );
}
