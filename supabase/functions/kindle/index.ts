// The Kindle dashboard's feed (public/kindle.html): Latest News, as JSON, for
// the one person with the secret code. The code is in Supabase's secrets
// (KINDLE_TOKEN), never in this repository; anything else gets nothing.
// Read-only, and only the news. Deploy: npm run kindle:deploy
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
});

// (only the dashboard's own page may read it)
const CORS = {
    "Access-Control-Allow-Origin": "https://vervetdb.com",
    "Access-Control-Allow-Headers": "content-type",
    "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// The same length, every character compared: no clues from how long it took
function same(a: string, b: string) {
    if (!a || !b || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (!same(url.searchParams.get("token") ?? "", Deno.env.get("KINDLE_TOKEN") ?? "")) return json({ error: "Not found" }, 404);
    // (the last 48 hours, or as asked: 1 to 14 days)
    const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 2, 1), 14);
    const { data, error } = await supabase.rpc("latest_news", { days });
    if (error) {
        console.error("Kindle news failed:", error);
        return json({ error: "Couldn't load the news" }, 500);
    }
    return json({ updated: new Date().toISOString(), days, news: data ?? [] });
});
