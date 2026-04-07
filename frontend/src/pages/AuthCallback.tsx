import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Shield } from "lucide-react";

// ---------------------------------------------------------------------------
// AuthCallback Page
// ---------------------------------------------------------------------------
// After OAuth (Google/GitHub), Supabase redirects the browser to this URL:
//   http://localhost:5173/auth/callback
//
// The URL contains a special token in the hash fragment (#access_token=...).
// Supabase JS automatically reads this token and creates a session.
// We just need to wait for that to happen, then redirect to the dashboard.
// ---------------------------------------------------------------------------
const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Step 1: Check if Supabase already processed the token from the URL
    // and created a session. This handles the case where the page loads
    // after the OAuth redirect and the token is in the URL hash.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Session exists — go to dashboard
        navigate("/dashboard", { replace: true });
        return;
      }

      // Step 2: No session yet — listen for it to be created.
      // Supabase JS reads the token from the URL hash and fires SIGNED_IN.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (event === "SIGNED_IN" && session) {
            navigate("/dashboard", { replace: true });
          }
        }
      );

      // If nothing happens after 5 seconds, something went wrong
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
