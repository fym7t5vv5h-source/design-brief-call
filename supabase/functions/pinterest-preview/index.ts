// Supabase Edge Function: pinterest-preview
// Deploy: supabase functions deploy pinterest-preview --no-verify-jwt (or with JWT)
//
// POST { "url": "https://www.pinterest.com/pin/..." }
// Returns { thumbnail_url, title, provider }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const oembed = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembed, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Pinterest preview unavailable", status: res.status }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    return new Response(
      JSON.stringify({
        thumbnail_url: data.thumbnail_url || "",
        title: data.title || "",
        provider: data.provider_name || "Pinterest",
        html: data.html || "",
      }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
