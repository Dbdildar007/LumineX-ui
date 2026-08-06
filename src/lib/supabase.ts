// Browser Supabase client for the external project the user provisioned.
// Publishable/anon key is safe to ship. Never put service_role here.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vfubnykeohrrcszsbszm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmdWJueWtlb2hycmNzenNic3ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MDczOTYsImV4cCI6MjEwMDk4MzM5Nn0.goepfCdNPvZAtT5JkM79tc0wJt9Y5wwlJiqr_SB0nY4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Stable per-device UUID used as the anonymous identity for likes/bookmarks/progress.
const DEVICE_KEY = "dramareel:device-id";
export function getDeviceId(): string {
  if (typeof window === "undefined") return "00000000-0000-0000-0000-000000000000";
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
