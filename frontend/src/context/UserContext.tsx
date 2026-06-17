import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  signup_provider: "email" | "google" | "github";
  last_login_provider: "email" | "google" | "github" | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
}

export interface UpdateProfilePayload {
  full_name?: string;
  avatar_url?: string;
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
    const cached = localStorage.getItem(`profile:${userId}`);
    if (cached) {
      try {
        setProfile(JSON.parse(cached));
      } catch {
        localStorage.removeItem(`profile:${userId}`);
      }
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to fetch profile", error.message);
      return;
    }

    if (data) {
      const nextProfile = data as ProfileRow;
      setProfile(nextProfile);
      localStorage.setItem(`profile:${userId}`, JSON.stringify(nextProfile));
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          setProfile(prev => {
            if (prev?.user_id === currentUser.id) return prev;

            const cached = localStorage.getItem(`profile:${currentUser.id}`);
            if (cached) {
              try {
                const parsed = JSON.parse(cached) as ProfileRow;
                fetchProfile(currentUser.id);
                return parsed;
              } catch {
                localStorage.removeItem(`profile:${currentUser.id}`);
              }
            }

            fetchProfile(currentUser.id);
            return null;
          });
          setLoading(false);
        } else {
          setProfile(null);
          setLoading(false);
          Object.keys(localStorage)
            .filter(key => key.startsWith("profile:"))
            .forEach(key => localStorage.removeItem(key));
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const updateProfile = useCallback(
    async (payload: UpdateProfilePayload): Promise<{ error: string | null }> => {
      const userId = user?.id;
      const email = user?.email;
      if (!userId) return { error: "Not authenticated" };
      if (!email) return { error: "Authenticated user has no email" };

      const patch: Partial<ProfileRow> = { user_id: userId, email };
      if (payload.full_name !== undefined) patch.full_name = payload.full_name;
      if (payload.avatar_url !== undefined) patch.avatar_url = payload.avatar_url;

      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("user_id", userId);

      if (error) return { error: error.message };

      const authData: Record<string, string> = {};
      if (payload.full_name !== undefined) authData.full_name = payload.full_name;
      if (payload.avatar_url !== undefined) {
        const objectPath = payload.avatar_url.replace(/^avatars\//, "");
        authData.avatar_url = supabase.storage.from("avatars").getPublicUrl(objectPath).data.publicUrl;
      }

      if (Object.keys(authData).length > 0) {
        const { error: authError } = await supabase.auth.updateUser({ data: authData });
        if (authError) return { error: authError.message };
      }

      setProfile(prev => {
        const updated: ProfileRow = prev
          ? { ...prev, ...patch }
          : {
              user_id: userId,
              email,
              full_name: null,
              avatar_url: null,
              signup_provider: "email",
              last_login_provider: null,
              is_active: true,
              created_at: "",
              updated_at: "",
              last_sign_in_at: null,
              ...patch,
            };
        localStorage.setItem(`profile:${userId}`, JSON.stringify(updated));
        return updated;
      });

      return { error: null };
    },
    [user?.email, user?.id]
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

export function useUserContext(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUserContext must be used inside <UserProvider>");
  return ctx;
}
