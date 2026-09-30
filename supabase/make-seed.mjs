// Turns src/monkeysArr.js and src/groupsArr.js into supabase/seed.sql,
// which loads all the current troops and monkeys into the database.
// Run from the project folder:   node supabase/make-seed.mjs
// (Only needed once, when first moving the data into Supabase.)

import fs from "node:fs";
import monkeysArr from "../src/monkeysArr.js";
import groupsArr from "../src/groupsArr.js";

// A SQL text value: 'like this', with any ' doubled
const text = (value) => `'${String(value ?? "").replace(/'/g, "''")}'`;

const troops = groupsArr.filter((g) => g !== "All Troops");

const troopRows = troops.map((name, i) => `    (${text(name)}, ${i + 1})`);

const monkeyRows = monkeysArr.map((m) => {
    const year = m.year === "" ? "null::integer" : Number(m.year);
    const photos = `array[${m.img.map(text).join(", ")}]::text[]`;
    return `    (${[
        text(m.name),
        text(m.sex ?? ""),
        text(m.chip),
        text(m.troop),
        year,
        photos,
        text(m.bio),
        text(m.desc),
    ].join(", ")})`;
});

const sql = `-- All current troops and monkeys, generated from monkeysArr.js by
-- supabase/make-seed.mjs. Run once, after schema.sql:
-- Supabase SQL Editor → New query → paste all of this → Run.

insert into public.troops (name, sort_order) values
${troopRows.join(",\n")};

insert into public.monkeys
    (name, sex, chip, troop_id, birth_year, photos, bio, description)
select v.name, v.sex, v.chip, t.id, v.birth_year, v.photos, v.bio, v.description
from (values
${monkeyRows.join(",\n")}
) as v (name, sex, chip, troop, birth_year, photos, bio, description)
join public.troops t on t.name = v.troop;

-- Should say ${troops.length} troops and ${monkeysArr.length} monkeys
select
    (select count(*) from public.troops) as troops,
    (select count(*) from public.monkeys) as monkeys;
`;

fs.writeFileSync(new URL("./seed.sql", import.meta.url), sql);
console.log(`Wrote supabase/seed.sql: ${troops.length} troops, ${monkeysArr.length} monkeys`);
