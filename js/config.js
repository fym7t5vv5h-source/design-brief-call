/**
 * Free Supabase project for shared briefs.
 * Do NOT put sb_secret_… keys here — only publishable/anon.
 *
 * On Vercel we call the API via same-origin `/sb` proxy so login works
 * even when supabase.co is blocked without VPN (e.g. some RU networks).
 */
export const SUPABASE_DIRECT_URL = "https://vzxelhojewcbtsdzjypf.supabase.co";

export function resolveSupabaseUrl() {
  if (typeof location !== "undefined" && location.hostname.endsWith("vercel.app")) {
    return `${location.origin}/sb`;
  }
  return SUPABASE_DIRECT_URL;
}

/** Rewrite stored Supabase file URLs so images also go through the proxy. */
export function proxiedAssetUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (typeof location === "undefined" || !location.hostname.endsWith("vercel.app")) return url;
  if (url.startsWith(SUPABASE_DIRECT_URL)) {
    return `${location.origin}/sb${url.slice(SUPABASE_DIRECT_URL.length)}`;
  }
  return url;
}

export const config = {
  get supabaseUrl() {
    return resolveSupabaseUrl();
  },
  supabaseAnonKey: "sb_publishable_-rbJXLkFfBo1EgC7PLEJ6Q_ZBIRwYQc",
};
