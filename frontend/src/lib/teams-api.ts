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
  branches: string[] | null;
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

export interface TeamDashboardMetrics {
  totalScans: number;
  criticalVulns: number;
  healthScore: number;
}

export interface TeamDashboardMember {
  userId: string;
  name: string;
  initials: string;
  role: TeamRole;
  branches: string[];
  branch: string;
  healthScore: number | null;
  lastScanAt: string | null;
}

export interface TeamDashboardScan {
  id: string;
  projectName: string;
  date: string;
  status: string;
  branch: string | null;
  memberId: string | null;
  memberName: string | null;
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface TeamDashboardTrendPoint {
  date: string;
  critical: number;
  high: number;
  medium: number;
}

export interface TeamDashboardCriticalAlert {
  id: string;
  title: string;
  project: string;
  timeAgo: string;
  createdAt: string;
  memberName: string | null;
  branch: string | null;
}

export interface TeamDashboardData {
  metrics: TeamDashboardMetrics;
  members: TeamDashboardMember[];
  recentScans: TeamDashboardScan[];
  vulnerabilityTrend: TeamDashboardTrendPoint[];
  criticalAlerts: TeamDashboardCriticalAlert[];
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

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const getSessionToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;

    const refreshed = await supabase.auth.refreshSession();
    return refreshed.data.session?.access_token ?? null;
  };

  const request = async (accessToken: string) => {
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
  };

  let accessToken = await getSessionToken();
  if (!accessToken) throw new Error("Not authenticated");

  let res = await request(accessToken);

  if (res.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    accessToken = refreshed.data.session?.access_token ?? "";
    if (!accessToken) throw new Error("Not authenticated");
    res = await request(accessToken);
  }

  // 204 No Content — DELETE endpoints return no body
  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => ({}));

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
//
// Realtime invalidation: subscribes to Supabase CDC on the `teams` and
// `team_members` tables. Any INSERT/UPDATE/DELETE busts the cache so the
// next call to listTeams() fetches fresh data from the API.
// ---------------------------------------------------------------------------

const TEAMS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let _teamsCache: { data: Team[]; timestamp: number } | null = null;

/** Clear the teams cache — called after any mutation */
export function invalidateTeamsCache(): void {
  _teamsCache = null;
}

// Subscribe to realtime changes on teams + team_members so the cache is
// automatically busted whenever data changes (even from another session/tab).
// We set this up once at module load time; the subscription is long-lived.
(function setupTeamsCacheInvalidation() {
  // Guard: only run in browser environments (not SSR / test runners)
  if (typeof window === "undefined") return;

  supabase
    .channel("teams-cache-invalidation")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "teams" },
      () => { invalidateTeamsCache(); }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "team_members" },
      () => { invalidateTeamsCache(); }
    )
    .subscribe();
})();

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

/** GET /teams/:id/dashboard - selected team's dashboard aggregates */
export async function getTeamDashboard(teamId: string): Promise<TeamDashboardData> {
  return apiFetch<TeamDashboardData>(`/teams/${teamId}/dashboard`);
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

/** POST /teams/:id/github/sync-branches — re-sync branches using the stored installation token, no PAT needed */
export async function syncBranches(teamId: string): Promise<Team> {
  invalidateTeamsCache();
  return apiFetch<Team>(`/teams/${teamId}/github/sync-branches`, {
    method: "POST",
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

/**
 * POST /teams/:id/github/connect-repo
 * Fast-connect: saves the repo URL immediately with an empty branch list and
 * returns without waiting for the branch fetch.  Follow up with syncBranches()
 * in the background to populate branches while showing a skeleton loader.
 */
export async function connectRepoInstant(
  teamId: string,
  repoFullName: string,
  repoUrl: string
): Promise<Team> {
  invalidateTeamsCache();
  return apiFetch<Team>(`/teams/${teamId}/github/connect-repo`, {
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

/** PATCH /teams/:id/members/:userId — update role and/or branches */
export async function updateMember(
  teamId: string,
  userId: string,
  updates: { role?: TeamRole; branches?: string[] }
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
