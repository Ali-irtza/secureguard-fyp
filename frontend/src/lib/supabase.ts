import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase Client
// ---------------------------------------------------------------------------
// This is the single Supabase client instance for the entire frontend.
// It uses the ANON key — safe to expose in the browser.
// The anon key only allows what RLS policies permit.
// The service_role key NEVER goes in the frontend.
// ---------------------------------------------------------------------------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
