import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Shield } from "lucide-react";
import type { User } from "@supabase/supabase-js";

const VALID_PROVIDERS = ["email", "google", "github"] as const;
type AuthProvider = typeof VALID_PROVIDERS[number];

const toProvider = (provider: unknown): AuthProvider | null =>
  VALID_PROVIDERS.includes(provider as AuthProvider) ? (provider as AuthProvider) : null;

const getProvider = (user: User): AuthProvider => {
  const intendedProvider = toProvider(sessionStorage.getItem("secureguard_oauth_provider"));
  if (intendedProvider) return intendedProvider;

  const provider = user.app_metadata?.provider;
  const appProvider = toProvider(provider);
  if (appProvider) return appProvider;

  const identityProvider = [...(user.identities ?? [])]
    .reverse()
    .map(identity => toProvider(identity.provider))
    .find(Boolean);

  return identityProvider ?? "email";
};

const getProfileName = (user: User) => {
  const metadata = user.user_metadata ?? {};
  return (
    metadata.full_name ||
    metadata.name ||
    metadata.user_name ||
    user.email?.split("@")[0] ||
    "User"
  );
};

const syncProfileAfterAuth = async (user: User) => {
  if (!user.email) return;

  const provider = getProvider(user);
  const now = new Date().toISOString();

  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError) {
    console.warn("Failed to check profile after auth", selectError.message);
    return;
  }

  if (existing) {
    await supabase
      .from("profiles")
      .update({
        email: user.email,
        last_login_provider: provider,
        last_sign_in_at: user.last_sign_in_at ?? now,
      })
      .eq("user_id", user.id);
    return;
  }

  const { error: insertError } = await supabase.from("profiles").insert({
    user_id: user.id,
    full_name: getProfileName(user),
    email: user.email,
    avatar_url: null,
    signup_provider: provider,
    last_login_provider: provider,
    is_active: true,
    last_sign_in_at: user.last_sign_in_at ?? now,
  });

  if (insertError) {
    console.warn("Profile fallback insert failed", insertError.message);
  }
};

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const hashParams = new URLSearchParams(window.location.hash.replace("#", ""));
    const queryParams = new URLSearchParams(window.location.search);
    const isRecovery =
      hashParams.get("type") === "recovery" ||
      queryParams.get("type") === "recovery";

    const clearAuthTimeout = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    const init = async () => {
      if (isRecovery) {
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
            clearAuthTimeout();
            navigate("/reset-password", { replace: true });
          }
        });
        subscription = data.subscription;

        timeout = setTimeout(async () => {
          const { data: { session } } = await supabase.auth.getSession();
          navigate(session ? "/reset-password" : "/forgot-password", { replace: true });
        }, 3000);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        await syncProfileAfterAuth(session.user);
        sessionStorage.removeItem("secureguard_oauth_provider");
        navigate("/dashboard", { replace: true });
        return;
      }

      const { data } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (event === "SIGNED_IN" && newSession?.user) {
          clearAuthTimeout();
          await syncProfileAfterAuth(newSession.user);
          sessionStorage.removeItem("secureguard_oauth_provider");
          navigate("/dashboard", { replace: true });
        }
      });
      subscription = data.subscription;

      timeout = setTimeout(() => {
        navigate("/auth", { replace: true });
      }, 5000);
    };

    void init();

    return () => {
      subscription?.unsubscribe();
      clearAuthTimeout();
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
