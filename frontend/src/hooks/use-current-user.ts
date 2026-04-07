import { useUserContext } from "@/context/UserContext";
import type { ProfileRow, UpdateProfilePayload } from "@/context/UserContext";
import type { User } from "@supabase/supabase-js";

// Re-export types so callers don't need to import from context directly
export type { ProfileRow, UpdateProfilePayload };

// ---------------------------------------------------------------------------
// useCurrentUser
// ---------------------------------------------------------------------------
// Thin hook — reads from UserContext (fetched once at app level).
// No DB calls here. No duplicate fetches. Just derived values + mutations.
// ---------------------------------------------------------------------------

interface UseCurrentUserReturn {
  user: User | null;
  profile: ProfileRow | null;
  loading: boolean;
  displayName: string;
  email: string;
  avatarUrl: string;
  initials: string;
  isOAuthUser: boolean;
  updateProfile: (payload: UpdateProfilePayload) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

export function useCurrentUser(): UseCurrentUserReturn {
  const { user, profile, loading, updateProfile, updatePassword } = useUserContext();

  // All display values from profiles table only
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const email       = user?.email || "";
  const avatarUrl   = profile?.avatar_url || "";

  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // profiles.provider is primary; app_metadata is fallback for pre-migration users
  const isOAuthUser =
    (profile?.provider != null && profile.provider !== "email") ||
    (user?.app_metadata?.provider != null && user.app_metadata.provider !== "email");

  return { user, profile, loading, displayName, email, avatarUrl, initials, isOAuthUser, updateProfile, updatePassword };
}
