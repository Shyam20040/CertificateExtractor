import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigurationError = getConfigurationError(supabaseUrl, supabaseAnonKey);
export const supabaseClient = supabaseConfigurationError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

export function requireSupabase() {
  if (!supabaseClient) {
    throw new Error(supabaseConfigurationError);
  }
  return supabaseClient;
}

function getConfigurationError(url, key) {
  if (!url || !key) {
    return "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the project .env file, then restart the app.";
  }

  try {
    const parsedUrl = new URL(url);
    const isLocalhost = ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
    if ((!isLocalhost && parsedUrl.protocol !== "https:") || (isLocalhost && !["http:", "https:"].includes(parsedUrl.protocol))) {
      return "VITE_SUPABASE_URL must be your Supabase Project URL, such as https://your-project-ref.supabase.co. Do not use the PostgreSQL database connection string.";
    }
    if (!parsedUrl.hostname.includes(".") || parsedUrl.hostname === "your-project-id.supabase.co") {
      return "Set VITE_SUPABASE_URL to the Project URL shown in Supabase Dashboard → Project Settings → API. Do not use the PostgreSQL database connection string.";
    }
  } catch {
    return "VITE_SUPABASE_URL must be a valid Supabase Project URL, such as https://your-project-ref.supabase.co.";
  }

  if (/^(your_|placeholder|replace)/i.test(key)) {
    return "Replace VITE_SUPABASE_ANON_KEY in the project .env file with this project's publishable/anon key.";
  }
  return "";
}
