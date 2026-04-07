import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// UserContext
// ---------------------------------------------------------------------------
// Fetches session + profile ONCE at the app level.
// Every component that calls useCurrentUser() reads from this shared context —
// no component ever triggers its own DB fetch.
// ---------------------------------------------------------------------------

export interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  provider: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateProfilePayload {
  full_name?: string;
  avatar_url?: string;
  bio?: string;
}

interface UserContextValue {
  user: User | null;
  profile: ProfileRow | null;
  loading: boolean;
  updateProfile: (payload: UpdateProfilePayload) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    // Check localStorage cache first — show it instantly while DB fetch runs
    const cached = localStorage.getItem(`profile:${userId}`);
    if (cached) {
      try { setProfile(JSON.parse(cached)); } catch { /* ignore bad cache */ }
    }

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (data) {
      setProfile(data as ProfileRow);
      // Update cache with fresh data
      localStorage.setItem(`profile:${userId}`, JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    // Run session read and profile fetch in parallel.
    // getSession() reads from localStorage (instant).
    // fetchProfile() is the only real network call — start it immediately.
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // onAuthStateChange fires on: login, logout, token refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          setProfile(prev => {
            if (prev?.id === currentUser.id) {
              // Same user, profile already loaded — do nothing
              return prev;
            }
            // Different user or fresh login — load from cache immediately
            // so the UI shows correct data before the DB fetch completes
            const cached = localStorage.getItem(`profile:${currentUser.id}`);
            if (cached) {
              try {
                const parsed = JSON.parse(cached) as ProfileRow;
                // Kick off a background refresh to get latest data
                fetchProfile(currentUser.id);
                return parsed; // show cached data instantly
              } catch { /* ignore */ }
            }
            // No cache — fetch from DB (first ever login)
            fetchProfile(currentUser.id);
            return null;
          });
        } else {
          setProfile(null);
          setLoading(false);
          // Clear cache on logout
          Object.keys(localStorage)
            .filter(k => k.startsWith("profile:"))
            .forEach(k => localStorage.removeItem(k));
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Writes only to profiles table — never to auth/user_metadata
  const updateProfile = useCallback(
    async (payload: UpdateProfilePayload): Promise<{ error: string | null }> => {
      const userId = user?.id;
      if (!userId) return { error: "Not authenticated" };

      const patch: Record<string, string> = { id: userId };
      if (payload.full_name !== undefined) patch.full_name = payload.full_name;
      if (payload.avatar_url !== undefined) patch.avatar_url = payload.avatar_url;
      if (payload.bio !== undefined) patch.bio = payload.bio;

      const { error } = await supabase
        .from("profiles")
        .upsert(patch, { onConflict: "id" });

      if (error) return { error: error.message };

      // Merge into local state — no second DB call
      setProfile(prev => {
        const updated = prev
          ? { ...prev, ...patch }
          : { id: userId, full_name: null, avatar_url: null, bio: null, provider: null, created_at: "", updated_at: "", ...patch };
        // Keep cache in sync so next reload is instant
        localStorage.setItem(`profile:${userId}`, JSON.stringify(updated));
        return updated;
      });

      return { error: null };
    },
    [user?.id]
  );

  const updatePassword = useCallback(
    async (newPassword: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { error: error.message };
      return { error: null };
    },
    []
  );

  return (
    <UserContext.Provider value={{ user, profile, loading, updateProfile, updatePassword }}>
      {children}
    </UserContext.Provider>
  );
}

// Internal — only used by useCurrentUser hook
export function useUserContext(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUserContext must be used inside <UserProvider>");
  return ctx;
}
