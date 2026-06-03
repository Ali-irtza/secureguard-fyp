// Use VITE_API_URL in production/deployment.
// Local development falls back to localhost if the variable is missing.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";
