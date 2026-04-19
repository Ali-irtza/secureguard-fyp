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
// Teams API
// ---------------------------------------------------------------------------

/** GET /teams — all teams the current user belongs to */
export async function listTeams(): Promise<Team[]> {
  const data = await apiFetch<{ teams: Team[] }>("/teams");
  return data.teams;
}

/** POST /teams — create a new team */
export async function createTeam(name: string): Promise<Team> {
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
  return apiFetch<Team>(`/teams/${teamId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/** DELETE /teams/:id */
export async function deleteTeam(teamId: string): Promise<void> {
  return apiFetch<void>(`/teams/${teamId}`, { method: "DELETE" });
}

/** POST /teams/:id/github — connect repo, fetch branches, PAT discarded after */
export async function connectGithub(
  teamId: string,
  repoUrl: string,
  pat: string
): Promise<Team> {
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
  return apiFetch<Team>(`/teams/${teamId}/github/refresh`, {
    method: "POST",
    body: JSON.stringify({ repo_url: repoUrl, pat }),
  });
}

/** POST /teams/:id/members — invite by email */
export async function inviteMember(
  teamId: string,
  email: string,
  role: "developer" | "viewer"
): Promise<TeamMember> {
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
  return apiFetch<void>(`/teams/${teamId}/members/${userId}`, {
    method: "DELETE",
  });
}
