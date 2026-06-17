import { useUserContext } from "@/context/UserContext";
import type { ProfileRow, UpdateProfilePayload } from "@/context/UserContext";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

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
  hasEmailIdentity: boolean;
  updateProfile: (payload: UpdateProfilePayload) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

export function useCurrentUser(): UseCurrentUserReturn {
  const { user, profile, loading, updateProfile, updatePassword } = useUserContext();

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const email       = user?.email || "";
  const avatarUrl = (() => {
    if (!profile?.avatar_url) return "";
    if (/^https?:\/\//i.test(profile.avatar_url)) return profile.avatar_url;
    const objectPath = profile.avatar_url.replace(/^avatars\//, "");
    return supabase.storage.from("avatars").getPublicUrl(objectPath).data.publicUrl;
  })();

  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // ---------------------------------------------------------------------------
  // hasEmailIdentity — the correct industry-standard way to check this.
  //
  // WHAT IS user.identities?
  //   Supabase stores every login method a user has ever used as an "identity"
  //   in the user.identities array. Each entry has a { provider } field.
  //
  //   Examples:
  //     Signed up with Google only       → identities = [{ provider: "google" }]
  //     Signed up with email only        → identities = [{ provider: "email" }]
  //     Linked Google + email            → identities = [{ provider: "google" }, { provider: "email" }]
  //
  // WHY NOT app_metadata.provider?
  //   app_metadata.provider is unreliable — Supabase sets it at signup and
  //   does not consistently update it on every login. It reflects the first
  //   or last provider depending on the Supabase version. Never use it for
  //   feature gating.
  //
  // WHY NOT profile.provider (DB column)?
  //   Written once at first signup, never updated. A user who signed up with
  //   Google and later added email/password would still show provider="google".
  //
  // THE CORRECT RULE:
  //   Show "Change Password" if and only if the user has an email identity.
  //   This means they signed up with email OR linked email to their account.
  //   It doesn't matter which method they used to log in THIS session.
  //   If they have a password, they can change it.
  // ---------------------------------------------------------------------------
  const hasEmailIdentity = (user?.identities ?? []).some(
    (identity) => identity.provider === "email"
  );

  // Keep isOAuthUser for any other UI that needs it (e.g. showing "Managed by Google")
  // but Settings now uses hasEmailIdentity directly for the password section.
  const isOAuthUser = !hasEmailIdentity && (user?.identities ?? []).length > 0;

  return { user, profile, loading, displayName, email, avatarUrl, initials, isOAuthUser, hasEmailIdentity, updateProfile, updatePassword };
}
