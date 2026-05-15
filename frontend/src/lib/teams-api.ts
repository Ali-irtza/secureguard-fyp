import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types — mirror the backend Pydantic response schemas exactly
// ---------------------------------------------------------------------------

export type TeamRole = "admin" | "developer" | "viewer";

export interface MemberProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

export interface TeamMember {
  id: string;           // team_members row id
  user_id: string;
  role: TeamRole;
  branch: string | null;
  profile: MemberProfile;
  joined_at: string;
}

export interface Team {
  id: string;
  name: string;
  github_repo: string | null;
  github_branches: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  current_user_role: TeamRole;
  member_count: number;
  members: TeamMember[];
}

// ---------------------------------------------------------------------------
// Base fetch helper
// ---------------------------------------------------------------------------
// All API calls go through here.
// - Reads the current session JWT automatically (no manual token passing)
// - Throws a typed Error with the backend's detail message on failure
// - DRY: auth header logic lives in one place only
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_URL as string ?? "http://localhost:8000";

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // Get the current session token — Supabase stores it in localStorage
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) throw new Error("Not authenticated");

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });

  // 204 No Content — DELETE endpoints return no body
  if (res.status === 204) return undefined as T;

  const json = await res.json();

  if (!res.ok) {
    // FastAPI returns { detail: "..." } on errors
    throw new Error(json.detail ?? `Request failed: ${res.status}`);
  }

  return json as T;
}

// ---------------------------------------------------------------------------
// Teams Cache — avoids re-fetching on every page navigation
// ---------------------------------------------------------------------------
// Simple in-memory cache with TTL. Mutations auto-invalidate it.
// Survives SPA navigation but clears on full page refresh (which is fine).
// ---------------------------------------------------------------------------

const TEAMS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _teamsCache: { data: Team[]; timestamp: number } | null = null;

/** Clear the teams cache — called after any mutation */
export function invalidateTeamsCache(): void {
  _teamsCache = null;
}

// ---------------------------------------------------------------------------
// Teams API
// ---------------------------------------------------------------------------

/** GET /teams — all teams the current user belongs to (cached) */
export async function listTeams(): Promise<Team[]> {
  // Return cached data if fresh
  if (_teamsCache && Date.now() - _teamsCache.timestamp < TEAMS_CACHE_TTL_MS) {
    return _teamsCache.data;
  }

  const data = await apiFetch<{ teams: Team[] }>("/teams");
  _teamsCache = { data: data.teams, timestamp: Date.now() };
  return data.teams;
}

/** POST /teams — create a new team */
export async function createTeam(name: string): Promise<Team> {
  invalidateTeamsCache();
  return apiFetch<Team>("/teams", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

/** GET /teams/:id — single team */
export async function getTeam(teamId: string): Promise<Team> {
  return apiFetch<Team>(`/teams/${teamId}`);
}

/** PATCH /teams/:id — rename and/or connect GitHub repo */
export async function updateTeam(
  teamId: string,
  updates: { name?: string; github_repo?: string }
): Promise<Team> {
  invalidateTeamsCache();
  return apiFetch<Team>(`/teams/${teamId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/** DELETE /teams/:id */
export async function deleteTeam(teamId: string): Promise<void> {
  invalidateTeamsCache();
  return apiFetch<void>(`/teams/${teamId}`, { method: "DELETE" });
}

/** POST /teams/:id/github — connect repo, fetch branches, PAT discarded after */
export async function connectGithub(
  teamId: string,
  repoUrl: string,
  pat: string
): Promise<Team> {
  invalidateTeamsCache();
  return apiFetch<Team>(`/teams/${teamId}/github`, {
    method: "POST",
    body: JSON.stringify({ repo_url: repoUrl, pat }),
  });
}

/** POST /teams/:id/github/refresh — re-fetch branches with a fresh PAT */
export async function refreshGithubBranches(
  teamId: string,
  repoUrl: string,
  pat: string
): Promise<Team> {
  invalidateTeamsCache();
  return apiFetch<Team>(`/teams/${teamId}/github/refresh`, {
    method: "POST",
    body: JSON.stringify({ repo_url: repoUrl, pat }),
  });
}

// ---------------------------------------------------------------------------
// GitHub OAuth flow
// ---------------------------------------------------------------------------

/** GET /teams/:id/github/authorize — get the GitHub OAuth URL to redirect to */
export async function getGithubAuthorizeUrl(teamId: string): Promise<string> {
  const data = await apiFetch<{ authorization_url: string }>(`/teams/${teamId}/github/authorize`);
  return data.authorization_url;
}

/** GET /teams/:id/github/repos — list repos accessible via stored OAuth token */
export async function listGithubRepos(teamId: string): Promise<{ full_name: string; private: boolean; url: string }[]> {
  const data = await apiFetch<{ repos: { full_name: string; private: boolean; url: string }[] }>(`/teams/${teamId}/github/repos`);
  return data.repos;
}

/** POST /teams/:id/github/select-repo — connect a specific repo, fetch its branches */
export async function selectGithubRepo(
  teamId: string,
  repoFullName: string,
  repoUrl: string
): Promise<Team> {
  invalidateTeamsCache();
  return apiFetch<Team>(`/teams/${teamId}/github/select-repo`, {
    method: "POST",
    body: JSON.stringify({ repo_full_name: repoFullName, repo_url: repoUrl }),
  });
}

/** POST /teams/:id/members — invite by email */
export async function inviteMember(
  teamId: string,
  email: string,
  role: "developer" | "viewer"
): Promise<TeamMember> {
  invalidateTeamsCache();
  return apiFetch<TeamMember>(`/teams/${teamId}/members`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

/** PATCH /teams/:id/members/:userId — update role and/or branch */
export async function updateMember(
  teamId: string,
  userId: string,
  updates: { role?: TeamRole; branch?: string }
): Promise<TeamMember> {
  invalidateTeamsCache();
  return apiFetch<TeamMember>(`/teams/${teamId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/** DELETE /teams/:id/members/:userId */
export async function removeMember(
  teamId: string,
  userId: string
): Promise<void> {
  invalidateTeamsCache();
  return apiFetch<void>(`/teams/${teamId}/members/${userId}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Branch File Browsing
// ---------------------------------------------------------------------------

export interface BranchFileItem {
  path: string;
  type: "file" | "directory";
  size: number | null;
}

export interface BranchFilesResponse {
  branch: string;
  files: BranchFileItem[];
}

export interface FileContentResponse {
  branch: string;
  path: string;
  content: string;
  size: number;
  encoding: string;
}

// ---------------------------------------------------------------------------
// Branch Files Cache — module-level, survives SPA navigation
// ---------------------------------------------------------------------------

const BRANCH_FILES_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FILE_CONTENT_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Key: "teamId::branch"
const _branchFilesCache = new Map<string, CacheEntry<BranchFilesResponse>>();
// Key: "teamId::branch::path"
const _fileContentCache = new Map<string, CacheEntry<FileContentResponse>>();

/** Return cached branch files if available (even if stale) — for instant display */
export function getCachedBranchFiles(
  teamId: string,
  branch: string
): BranchFilesResponse | null {
  const entry = _branchFilesCache.get(`${teamId}::${branch}`);
  return entry?.data ?? null;
}

/** Return cached file content if available — for instant display */
export function getCachedFileContent(
  teamId: string,
  branch: string,
  filePath: string
): FileContentResponse | null {
  const key = `${teamId}::${branch}::${filePath}`;
  const entry = _fileContentCache.get(key);
  return entry?.data ?? null;
}

/** Check if branch files cache is still fresh (within TTL) */
export function isBranchFilesCacheFresh(
  teamId: string,
  branch: string
): boolean {
  const entry = _branchFilesCache.get(`${teamId}::${branch}`);
  if (!entry) return false;
  return Date.now() - entry.timestamp < BRANCH_FILES_TTL_MS;
}

/** GET /teams/:id/branches/:branch/files — fetch file tree, updates cache */
export async function fetchBranchFiles(
  teamId: string,
  branch: string
): Promise<BranchFilesResponse> {
  const res = await apiFetch<BranchFilesResponse>(
    `/teams/${teamId}/branches/${encodeURIComponent(branch)}/files`
  );
  _branchFilesCache.set(`${teamId}::${branch}`, {
    data: res,
    timestamp: Date.now(),
  });
  return res;
}

/** GET /teams/:id/branches/:branch/files/content — fetch single file, updates cache */
export async function fetchFileContent(
  teamId: string,
  branch: string,
  filePath: string
): Promise<FileContentResponse> {
  const key = `${teamId}::${branch}::${filePath}`;
  // Return from cache if fresh
  const cached = _fileContentCache.get(key);
  if (cached && Date.now() - cached.timestamp < FILE_CONTENT_TTL_MS) {
    return cached.data;
  }
  const res = await apiFetch<FileContentResponse>(
    `/teams/${teamId}/branches/${encodeURIComponent(branch)}/files/content?path=${encodeURIComponent(filePath)}`
  );
  _fileContentCache.set(key, { data: res, timestamp: Date.now() });
  return res;
}
