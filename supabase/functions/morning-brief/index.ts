// The Morning Brief's email (supabase/morning-brief.sql asks for it at 06:50,
// and for Email Me). The brief is worked out with the website's own rules
// (src/morningBriefRules.js), bundled here by `npm run brief:build`. Anyone can
// call this, but it only sends when the database says one is due.
// Update it after changing those rules: npm run brief:deploy
import { handle } from "./bundle.js";

Deno.serve(handle);
