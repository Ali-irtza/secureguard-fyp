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
    // Listen for the auth state change that happens when Supabase
    // processes the OAuth token from the URL
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          // Session established — go to dashboard
          navigate("/dashboard", { replace: true });
        } else if (event === "SIGNED_OUT" || !session) {
          // Something went wrong — go back to auth
          navigate("/auth", { replace: true });
        }
      }
    );

    // Cleanup listener when component unmounts
    return () => subscription.unsubscribe();
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
