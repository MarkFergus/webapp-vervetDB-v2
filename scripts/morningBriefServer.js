// Bundled into supabase/functions/morning-brief/bundle.js (npm run
// brief:build): asks the database whether a Morning Brief is due, and if so
// works it out and hands it back to be emailed.
import { supabase } from "../src/supabase";
import { briefEmail } from "../src/morningBriefRules";
import { loadMorningBrief } from "../src/morningBriefData";
import { loadDewormingPage, loadMonitoringPage } from "./kindlePages";

const reply = (message, status = 200) => new Response(JSON.stringify({ message }), { status });

// ---- The Kindle dashboard's Alerts page (public/kindle.html) ----
// ?kindle=alerts&token=…: the brief's To Do, and every item in red from the
// rest; ?kindle=monitoring and ?kindle=deworming: those pages (kindlePages.js).
// As JSON, for the one person with the secret code (KINDLE_TOKEN, as the
// kindle function's). Nothing is emailed.
const KINDLE_HEADERS = {
    "Access-Control-Allow-Origin": "https://vervetdb.com",
    "Access-Control-Allow-Headers": "content-type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
};

// The same length, every character compared: no clues from how long it took
function same(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

// → { updated, allClear, groups: [{ title, lines: [text] }] }
export function kindleAlerts(brief, now = new Date()) {
    const groups = [];
    for (const section of brief.sections) {
        if (section.id === "good_to_know") continue;
        for (const group of section.groups) {
            const lines = group.lines.filter((l) => section.id === "to_do" || l.alert).map((l) => l.text);
            if (lines.length) groups.push({ title: section.id === "to_do" ? group.title : `${section.title}: ${group.title}`, lines });
        }
    }
    return { updated: now.toISOString(), allClear: groups.length === 0, groups };
}

async function kindle(request) {
    const url = new URL(request.url);
    const token = Deno.env.get("KINDLE_TOKEN") ?? "";
    if (!same(url.searchParams.get("token") ?? "", token)) {
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: KINDLE_HEADERS });
    }
    // (alerts, monitoring or deworming)
    const page = url.searchParams.get("kindle");
    try {
        const body =
            page === "monitoring"
                ? await loadMonitoringPage()
                : page === "deworming"
                  ? await loadDewormingPage()
                  : kindleAlerts(await loadMorningBrief());
        return new Response(JSON.stringify(body), { headers: KINDLE_HEADERS });
    } catch (error) {
        console.error(`Kindle ${page} failed:`, error);
        return new Response(JSON.stringify({ error: "Couldn't load it" }), { status: 500, headers: KINDLE_HEADERS });
    }
}

export async function handle(request) {
    // (the Kindle's Alerts page: its own answer, nothing emailed)
    if (request) {
        const url = new URL(request.url);
        if (request.method === "OPTIONS" && url.searchParams.get("kindle")) return new Response(null, { headers: KINDLE_HEADERS });
        if (["alerts", "monitoring", "deworming"].includes(url.searchParams.get("kindle"))) return kindle(request);
    }
    try {
        const { data: kind, error } = await supabase.rpc("morning_brief_due");
        if (error) throw error;
        if (!kind) return reply("Not due");
        const email = briefEmail(await loadMorningBrief());
        const sent = await supabase.rpc("send_morning_brief", {
            brief_kind: kind,
            subject: email.subject,
            html: email.html,
            body_text: email.text,
        });
        if (sent.error) throw sent.error;
        return reply(sent.data ? "Sent" : "Already sent");
    } catch (error) {
        console.error("Morning Brief failed:", error);
        return reply("Morning Brief failed", 500);
    }
}
