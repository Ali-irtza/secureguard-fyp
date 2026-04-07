import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Shield } from "lucide-react";

// ---------------------------------------------------------------------------
// AuthCallback Page
// ---------------------------------------------------------------------------
// After OAuth (Google/GitHub), Supabase redirects the browser here:
//   http://localhost:8080/auth/callback
//
// The URL contains a token in the hash (#access_token=...).
// Supabase JS reads it automatically and creates a session.
//
// After the session is ready, we ensure the user has a profiles row.
// The DB trigger handles this on first signup, but we add a client-side
// upsert as a safety net (e.g. if the trigger ever fails silently).
//
// ON CONFLICT DO NOTHING logic is mirrored here:
//   - New user  → profile row is created with Google/GitHub data
//   - Returning user → upsert finds existing row, does nothing (preserves edits)
// ---------------------------------------------------------------------------
const AuthCallback = () => {
  const navigate = useNavigate();

  const ensureProfileExists = async (userId: string, userMetadata: Record<string, string>, appMetadata: Record<string, string>) => {
    // Check if profile already exists
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    // Profile exists — do nothing, preserve the user's edits
    if (existing) return;

    // Profile doesn't exist yet (trigger may have failed) — create it now
    // This only runs for brand new users
    const email = (await supabase.auth.getUser()).data.user?.email || "";
    await supabase.from("profiles").insert({
      id: userId,
      full_name:
        userMetadata?.full_name ||
        userMetadata?.name ||
        email.split("@")[0],
      avatar_url:
        userMetadata?.avatar_url ||
        userMetadata?.picture ||
        null,
      provider: appMetadata?.provider || "email",
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        await ensureProfileExists(
          session.user.id,
          session.user.user_metadata as Record<string, string>,
          session.user.app_metadata as Record<string, string>
        );
        navigate("/dashboard", { replace: true });
        return;
      }

      // No session yet — wait for Supabase to process the token from the URL hash
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === "SIGNED_IN" && session) {
            await ensureProfileExists(
              session.user.id,
              session.user.user_metadata as Record<string, string>,
              session.user.app_metadata as Record<string, string>
            );
            navigate("/dashboard", { replace: true });
          }
        }
      );

      // Safety timeout — if nothing happens in 5s, go back to login
      const timeout = setTimeout(() => {
        navigate("/auth", { replace: true });
      }, 5000);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timeout);
      };
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="relative">
            <Shield className="h-12 w-12 text-primary animate-pulse" />
            <div className="absolute inset-0 blur-xl bg-primary/30 -z-10" />
          </div>
        </div>
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
