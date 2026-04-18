import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Shield } from "lucide-react";

// ---------------------------------------------------------------------------
// AuthCallback Page
// ---------------------------------------------------------------------------
// Handles ALL Supabase auth redirects. Two cases:
//
// Case 1 — OAuth login (Google / GitHub):
//   URL hash: #access_token=...&type=bearer
//   Action: ensure profile row exists → navigate to /dashboard
//
// Case 2 — Password reset email link:
//   URL hash: #access_token=...&type=recovery
//   Action: navigate to /reset-password (user sets new password there)
//
// Supabase JS reads the hash automatically and fires onAuthStateChange
// with the correct event: SIGNED_IN or PASSWORD_RECOVERY.
// ---------------------------------------------------------------------------
const AuthCallback = () => {
  const navigate = useNavigate();

  // Safety net: if the DB trigger failed silently, create the profile row here.
  // ON CONFLICT DO NOTHING mirrors the trigger — returning users are never touched.
  const ensureProfileExists = async (
    userId: string,
    userMetadata: Record<string, string>,
    appMetadata: Record<string, string>,
  ) => {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (existing) return; // profile already exists — preserve user's edits

    const email = (await supabase.auth.getUser()).data.user?.email || "";
    await supabase.from("profiles").insert({
      id: userId,
      full_name: userMetadata?.full_name || userMetadata?.name || email.split("@")[0],
      avatar_url: userMetadata?.avatar_url || userMetadata?.picture || null,
      provider: appMetadata?.provider || "email",
    });
  };

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    // ---------------------------------------------------------------------------
    // Detect recovery type FIRST — before checking any existing session.
    //
    // Supabase puts the token in the URL hash: #access_token=...&type=recovery
    // We must check this BEFORE getSession(), because if the user is already
    // logged in, getSession() returns their existing session and we'd wrongly
    // send them to /dashboard instead of /reset-password.
    // ---------------------------------------------------------------------------
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.replace("#", ""));
    const isRecovery = hashParams.get("type") === "recovery";

    const init = async () => {
      // If the URL already tells us this is a recovery link, handle it immediately.
      // We don't need to wait for onAuthStateChange — Supabase processes the hash
      // token synchronously when the page loads.
      if (isRecovery) {
        // Give Supabase JS a moment to process the hash token into a session
        // (it does this automatically on page load, but it's async internally)
        const { data } = supabase.auth.onAuthStateChange((event, _session) => {
          if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
            if (timeout) clearTimeout(timeout);
            navigate("/reset-password", { replace: true });
          }
        });
        subscription = data.subscription;

        // Fallback: if onAuthStateChange doesn't fire within 3s, navigate anyway.
        // This handles the case where Supabase already processed the token before
        // our listener was registered.
        timeout = setTimeout(async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            navigate("/reset-password", { replace: true });
          } else {
            navigate("/forgot-password", { replace: true });
          }
        }, 3000);
        return;
      }

      // Not a recovery link — normal OAuth login flow.
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // Session already exists (e.g. page refresh after OAuth)
        await ensureProfileExists(
          session.user.id,
          session.user.user_metadata as Record<string, string>,
          session.user.app_metadata as Record<string, string>,
        );
        navigate("/dashboard", { replace: true });
        return;
      }

      // No session yet — wait for Supabase to process the OAuth token from the hash.
      const { data } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (timeout) clearTimeout(timeout);

        if (event === "SIGNED_IN" && newSession) {
          await ensureProfileExists(
            newSession.user.id,
            newSession.user.user_metadata as Record<string, string>,
            newSession.user.app_metadata as Record<string, string>,
          );
          navigate("/dashboard", { replace: true });
        }
      });
      subscription = data.subscription;

      // Safety timeout — if nothing happens in 5s, go back to login
      timeout = setTimeout(() => {
        navigate("/auth", { replace: true });
      }, 5000);
    };

    init();

    return () => {
      subscription?.unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
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
