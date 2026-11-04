// Bundled into supabase/functions/morning-brief/bundle.js (npm run
// brief:build): asks the database whether a Morning Brief is due, and if so
// works it out and hands it back to be emailed.
import { supabase } from "../src/supabase";
import { briefEmail } from "../src/morningBriefRules";
import { loadMorningBrief } from "../src/morningBriefData";

const reply = (message, status = 200) => new Response(JSON.stringify({ message }), { status });

export async function handle() {
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
