import { apiFetch } from "@/lib/teams-api";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types — mirror the backend Pydantic response schemas exactly
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  language: string | null;
  health_score: string | null;
  type: "personal" | "team";
  owner_id: string;
  team_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectPayload {
  name: string;
  language?: string;
  type?: "personal" | "team";
  team_id?: string;
}

export interface UpdateProjectPayload {
  name?: string;
  language?: string;
  health_score?: string;
  type?: "personal" | "team";
  team_id?: string;
}

// ---------------------------------------------------------------------------
// Projects Cache — avoids re-fetching on every page navigation
// ---------------------------------------------------------------------------
// Simple in-memory cache with a 1-hour TTL. Mutations auto-invalidate it.
// Survives SPA navigation but clears on full page refresh (which is fine).
//
// Realtime invalidation: subscribes to Supabase CDC on the `projects` table.
// Any INSERT/UPDATE/DELETE busts the cache so the next listProjects() call
// fetches fresh data from the API automatically.
// ---------------------------------------------------------------------------

const PROJECTS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let _projectsCache: { data: Project[]; timestamp: number } | null = null;

/** Clear the projects cache — called after any mutation */
export function invalidateProjectsCache(): void {
  _projectsCache = null;
}

// Subscribe to realtime changes on the projects table so the cache is
// automatically busted whenever data changes (even from another session/tab).
// Set up once at module load time; the subscription is long-lived.
(function setupProjectsCacheInvalidation() {
  if (typeof window === "undefined") return;

  supabase
    .channel("projects-cache-invalidation")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "projects" },
      () => { invalidateProjectsCache(); }
    )
    .subscribe();
})();

// ---------------------------------------------------------------------------
// Projects API
// ---------------------------------------------------------------------------

/** GET /projects — all projects visible to the current user (cached) */
export async function listProjects(): Promise<Project[]> {
  // Return cached data if still fresh
  if (_projectsCache && Date.now() - _projectsCache.timestamp < PROJECTS_CACHE_TTL_MS) {
    return _projectsCache.data;
  }

  const data = await apiFetch<{ projects: Project[] }>("/projects");
  _projectsCache = { data: data.projects, timestamp: Date.now() };
  return data.projects;
}

/** POST /projects — create a new project */
export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  invalidateProjectsCache();
  return apiFetch<Project>("/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** PATCH /projects/:id — partial update */
export async function updateProject(
  id: string,
  updates: UpdateProjectPayload
): Promise<Project> {
  invalidateProjectsCache();
  return apiFetch<Project>(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/** DELETE /projects/:id — single delete */
export async function deleteProject(id: string): Promise<void> {
  invalidateProjectsCache();
  return apiFetch<void>(`/projects/${id}`, { method: "DELETE" });
}

/** DELETE /projects/bulk-delete — vectorized delete, returns count */
export async function bulkDeleteProjects(
  ids: string[]
): Promise<{ deleted: number }> {
  invalidateProjectsCache();
  return apiFetch<{ deleted: number }>("/projects/bulk-delete", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}
