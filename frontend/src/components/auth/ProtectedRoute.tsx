import { Navigate } from "react-router-dom";
import { useUserContext } from "@/context/UserContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Wraps any route that requires authentication.
 * Reads from UserContext (already loaded at app level — no extra DB calls).
 * Shows nothing while the initial session check is in flight.
 * Redirects to /auth if no session found.
 */
const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading } = useUserContext();

  // Still checking session — render nothing to avoid flash
  if (loading) return null;

  // No session — redirect to login
  if (!user) return <Navigate to="/auth" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
