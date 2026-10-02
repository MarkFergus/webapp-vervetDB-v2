// Moves the old ImgBB monkey photos into vervetDB's own storage (the
// "monkey-photos" bucket in Supabase) and makes a small thumbnail of every
// photo, for the cards and for offline use.
//
//   node scripts/move-photos.mjs --dry-run            report only, changes nothing
//   node scripts/move-photos.mjs --troop "Goliath"    move one troop
//   node scripts/move-photos.mjs                      move everything
//
// - Signs in as you (email + password, asked when it starts): your editor
//   account is allowed to upload photos, so no secret keys are needed.
// - Photos are copied exactly (JPEG stays JPEG); the ImgBB originals are left
//   where they are, as a backup.
// - Each monkey's photo links are swapped for the new ones in the same order,
//   so the main (★) photo stays the main photo.
// - Every swap is written to scripts/photo-move-backup.json (old → new links).
// - Safe to stop and run again: monkeys already moved are skipped, and a
//   monkey that fails part-way is left exactly as it was.

import fs from "node:fs";
import readline from "node:readline";
import sharp from "sharp";
import { supabase, SUPABASE_URL } from "../src/supabase.js";
import { photoPath, thumbPath, THUMB_WIDTH, THUMB_HEIGHT, THUMB_QUALITY } from "../src/photoPaths.js";

const BUCKET = "monkey-photos";
const OURS = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const PLACEHOLDER = "https://i.ibb.co/2YvYtBJ/blank-image-min.jpg";
const BACKUP_FILE = new URL("./photo-move-backup.json", import.meta.url);
// Monkeys worked on at the same time (ImgBB is slow, so a few at once helps)
const AT_ONCE = 4;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const troopIndex = args.indexOf("--troop");
const onlyTroop = troopIndex >= 0 ? args[troopIndex + 1] : null;
if (troopIndex >= 0 && !onlyTroop) {
    console.error('Please give a troop name, e.g. --troop "Goliath"');
    process.exit(1);
}

const isImgbb = (url) => url.startsWith("https://i.ibb.co/") && url !== PLACEHOLDER;
const isOurs = (url) => url.startsWith(OURS);
const ourPath = (url) => decodeURIComponent(url.slice(OURS.length));
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

// ---- Small helpers ----

// Asks a question in the terminal
function ask(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// Asks for a password: each key shows as *, Backspace works, Ctrl+C stops
function askPassword(question) {
    const input = process.stdin;
    if (!input.isTTY) {
        console.error("Please run this in a normal terminal (e.g. VS Code's), so the password can be typed in.");
        process.exit(1);
    }
    return new Promise((resolve) => {
        process.stdout.write(question);
        let password = "";
        const onKey = (keys) => {
            for (const key of keys) {
                if (key === "\r" || key === "\n") {
                    input.off("data", onKey);
                    input.setRawMode(false);
                    input.pause();
                    process.stdout.write("\n");
                    resolve(password);
                    return;
                } else if (key === "\u0003") {
                    process.stdout.write("\n");
                    process.exit(1);
                } else if (key === "\u007f" || key === "\b") {
                    if (password) {
                        password = password.slice(0, -1);
                        process.stdout.write("\b \b");
                    }
                } else {
                    password += key;
                    process.stdout.write("*");
                }
            }
        };
        input.setRawMode(true);
        input.setEncoding("utf8");
        input.resume();
        input.on("data", onKey);
    });
}

async function download(url, tries = 3) {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
            if (!response.ok) throw new Error(`the server said ${response.status}`);
            return Buffer.from(await response.arrayBuffer());
        } catch (error) {
            if (attempt >= tries) throw new Error(`couldn't download ${url} (${error.message})`);
            // Say so, so a slow ImgBB doesn't look like the script has frozen
            const why = error.name === "TimeoutError" ? "no answer after 30 seconds" : error.message;
            console.log(`  (slow: ${why}, trying again: ${url})`);
            await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
    }
}

// Whether a link opens. "Too many requests" (429) or a dropped connection
// isn't an answer, so wait and ask again
async function exists(url, tries = 5) {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(30000) });
            if (response.status !== 429 || attempt >= tries) return response.ok;
        } catch {
            if (attempt >= tries) return false;
        }
        await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
}

// Runs fn on every item, a few at a time
async function eachAtOnce(items, fn) {
    let next = 0;
    const workers = Array.from({ length: Math.min(AT_ONCE, items.length) }, async () => {
        while (next < items.length) await fn(items[next++]);
    });
    await Promise.all(workers);
}

const makeThumbnail = (photo) =>
    sharp(photo)
        .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover" })
        .webp({ quality: Math.round(THUMB_QUALITY * 100) })
        .toBuffer();

// A dropped connection or "too many requests" is worth trying again;
// anything else (e.g. not allowed) isn't
const isBlip = (error) => /fetch failed|network|timed? ?out|429|too many|50\d/i.test(`${error.message} ${error.statusCode ?? ""}`);

async function upload(path, data, contentType, { replace = false } = {}, tries = 4) {
    for (let attempt = 1; ; attempt++) {
        const { error } = await supabase.storage.from(BUCKET).upload(path, data, {
            contentType,
            cacheControl: "31536000",
            upsert: replace,
        });
        if (!error) return;
        // The earlier try got through after all, just without telling us
        if (attempt > 1 && /already exists|duplicate|409/i.test(`${error.message} ${error.statusCode ?? ""}`)) return;
        if (!isBlip(error) || attempt >= tries) throw new Error(`couldn't upload ${path} (${error.message})`);
        console.log(`  (connection blip uploading ${path}, trying again)`);
        await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
}

function saveBackup(entry) {
    const all = fs.existsSync(BACKUP_FILE) ? JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8")) : [];
    all.push(entry);
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(all, null, 2) + "\n");
}

// ---- What needs doing ----

const { data: rows, error: loadError } = await supabase
    .from("monkeys")
    .select("id, name, photos, troops (name)")
    .order("id");
if (loadError) {
    console.error("Couldn't read the monkeys:", loadError.message);
    process.exit(1);
}
const monkeys = rows.map((m) => ({ id: m.id, name: m.name, troop: m.troops?.name ?? "", photos: m.photos ?? [] }));
const troopNames = [...new Set(monkeys.map((m) => m.troop))].sort();
if (onlyTroop && !troopNames.includes(onlyTroop)) {
    console.error(`There's no troop called "${onlyTroop}". Troops: ${troopNames.join(", ")}`);
    process.exit(1);
}
const chosen = monkeys.filter((m) => !onlyTroop || m.troop === onlyTroop);
const toMove = chosen.filter((m) => m.photos.some(isImgbb));

// ---- Sign in (not needed for a trial run) ----

if (!dryRun) {
    console.log("\nSign in with your vervetDB editor account.");
    const email = await ask("  Email:    ");
    const password = await askPassword("  Password: ");
    const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
        console.error(`Couldn't sign in: ${signInError.message}`);
        process.exit(1);
    }
    const { data: editor } = await supabase.from("editors").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (!editor) {
        console.error("That account isn't an editor, so it can't upload photos.");
        process.exit(1);
    }
    console.log(`Signed in as ${auth.user.email}.`);
}

// Photos already in our storage that don't have a thumbnail yet
const ourPhotos = chosen.flatMap((m) => m.photos.filter(isOurs));
const needThumbs = [];
console.log(`\nChecking ${ourPhotos.length} uploaded photos have thumbnails…`);
if (!dryRun) {
    // Signed in: list each troop's thumbnails folder (one request per troop)
    const folders = [...new Set(ourPhotos.map((url) => ourPath(url).split("/")[0]))];
    const have = new Set();
    for (const folder of folders) {
        for (let offset = 0; ; offset += 1000) {
            const { data, error } = await supabase.storage.from(BUCKET).list(`thumbs/${folder}`, { limit: 1000, offset });
            if (error) {
                console.error(`Couldn't list the thumbnails in ${folder}: ${error.message}`);
                process.exit(1);
            }
            data.forEach((file) => have.add(`thumbs/${folder}/${file.name}`));
            if (data.length < 1000) break;
        }
    }
    needThumbs.push(...ourPhotos.filter((url) => !have.has(thumbPath(ourPath(url)))));
} else {
    // Trial run (not signed in): ask for each thumbnail in turn
    let checked = 0;
    await eachAtOnce(ourPhotos, async (url) => {
        if (!(await exists(OURS + thumbPath(ourPath(url))))) needThumbs.push(url);
        if (++checked % 50 === 0) console.log(`  …${checked} of ${ourPhotos.length}`);
    });
}

const scope = onlyTroop ? `troop ${onlyTroop}` : "all troops";
console.log(`\nvervetDB photo move (${scope})`);
console.log(`  Monkeys with ImgBB photos to move: ${toMove.length}`);
console.log(`  ImgBB photos to move:              ${toMove.flatMap((m) => m.photos.filter(isImgbb)).length}`);
console.log(`  Uploaded photos needing a thumbnail: ${needThumbs.length}`);

// ---- Trial run: check every ImgBB photo can be downloaded, then stop ----

if (dryRun) {
    console.log("\nTrial run: checking every ImgBB photo can be downloaded (nothing is changed)…");
    const perTroop = {};
    const problems = [];
    let total = 0;
    let done = 0;
    await eachAtOnce(toMove, async (m) => {
        for (const url of m.photos.filter(isImgbb)) {
            try {
                const photo = await download(url);
                const { format, width, height } = await sharp(photo).metadata();
                total += photo.length;
                const t = (perTroop[m.troop] ??= { monkeys: new Set(), photos: 0, bytes: 0 });
                t.monkeys.add(m.id);
                t.photos++;
                t.bytes += photo.length;
                if (!["jpeg", "png", "webp"].includes(format)) {
                    problems.push(`${m.name} (${m.troop}): unexpected format "${format}" — ${url}`);
                } else if (Math.abs(width / height - 5 / 4) > 0.02) {
                    // Not the site's 5:4 shape (a pixel or two out doesn't matter)
                    console.log(`  note: ${m.name} (${m.troop}) is ${width}×${height}, not 5:4 (copied as it is)`);
                }
            } catch (error) {
                problems.push(`${m.name} (${m.troop}): ${error.message}`);
            }
        }
        done++;
        if (done % 10 === 0) console.log(`  …checked ${done} of ${toMove.length} monkeys`);
    });

    console.log("\nBy troop:");
    for (const [troop, t] of Object.entries(perTroop).sort()) {
        console.log(`  ${troop.padEnd(12)} ${String(t.monkeys.size).padStart(3)} monkeys  ${String(t.photos).padStart(3)} photos  ${mb(t.bytes).padStart(8)}`);
    }
    console.log(`\nTotal to copy: ${mb(total)}`);
    if (problems.length) {
        console.log(`\n${problems.length} problem(s) — these monkeys would be skipped and left as they are:`);
        problems.forEach((p) => console.log("  - " + p));
    } else {
        console.log("No problems: every photo downloaded fine.");
    }
    console.log("\nNothing was changed. To move one troop:  node scripts/move-photos.mjs --troop \"Goliath\"");
    process.exit(0);
}

if (!toMove.length && !needThumbs.length) {
    console.log("\nNothing to do: everything is already moved and has thumbnails.");
    await supabase.auth.signOut();
    process.exit(0);
}

// ---- The real thing ----

console.log("");

const moved = [];
const problems = [];
let stamp = Date.now();

await eachAtOnce(toMove, async (m) => {
    const uploaded = [];
    try {
        const newPhotos = [];
        for (const url of m.photos) {
            if (!isImgbb(url)) {
                newPhotos.push(url);
                continue;
            }
            const photo = await download(url);
            const { format } = await sharp(photo).metadata();
            const types = { jpeg: ["jpg", "image/jpeg"], png: ["png", "image/png"], webp: ["webp", "image/webp"] };
            if (!types[format]) throw new Error(`unexpected format "${format}" for ${url}`);
            const [extension, contentType] = types[format];
            const path = photoPath(m.troop, m.name, extension, stamp++);
            await upload(path, photo, contentType);
            uploaded.push(path);
            await upload(thumbPath(path), await makeThumbnail(photo), "image/webp", { replace: true });
            uploaded.push(thumbPath(path));
            newPhotos.push(OURS + path);
        }

        // Someone edited this monkey while we were copying: leave it alone
        const { data: now } = await supabase.from("monkeys").select("photos").eq("id", m.id).single();
        if (JSON.stringify(now?.photos) !== JSON.stringify(m.photos)) {
            throw new Error("its photos were changed by someone while moving; run the script again later");
        }

        const { data: saved, error } = await supabase
            .from("monkeys")
            .update({ photos: newPhotos })
            .eq("id", m.id)
            .select("id");
        if (error || saved?.length !== 1) {
            throw new Error(`couldn't save the new links (${error?.message ?? "not allowed"})`);
        }
        saveBackup({ id: m.id, name: m.name, troop: m.troop, old: m.photos, new: newPhotos, at: new Date().toISOString() });
        moved.push({ ...m, newPhotos });
        console.log(`  ✓ ${m.name} (${m.troop})`);
    } catch (error) {
        // Leave the monkey exactly as it was: remove anything uploaded for it
        if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
        problems.push(`${m.name} (${m.troop}): ${error.message}`);
        console.log(`  ✗ ${m.name} (${m.troop}): ${error.message}`);
    }
});

// Thumbnails for photos that were uploaded in the app before thumbnails existed
let thumbsMade = 0;
await eachAtOnce(needThumbs, async (url) => {
    try {
        await upload(thumbPath(ourPath(url)), await makeThumbnail(await download(url)), "image/webp", { replace: true });
        thumbsMade++;
    } catch (error) {
        problems.push(`thumbnail for ${url}: ${error.message}`);
    }
});

// ---- Check every new link works ----

console.log("\nChecking every new photo and thumbnail opens…");
const broken = [];
const toCheck = moved.flatMap((m) =>
    m.newPhotos.filter(isOurs).flatMap((url) => [url, OURS + thumbPath(ourPath(url))])
);
await eachAtOnce(toCheck, async (url) => {
    if (!(await exists(url))) broken.push(url);
});

console.log(`\nDone (${scope}).`);
console.log(`  Monkeys moved:     ${moved.length} of ${toMove.length}`);
console.log(`  Thumbnails made for earlier uploads: ${thumbsMade} of ${needThumbs.length}`);
console.log(`  Links checked:     ${toCheck.length}, ${broken.length ? `${broken.length} NOT opening` : "all open fine"}`);
if (broken.length) broken.forEach((url) => console.log("    - " + url));
if (problems.length) {
    console.log(`\n${problems.length} problem(s) — these were left as they were; running the script again retries them:`);
    problems.forEach((p) => console.log("  - " + p));
}
console.log("\nOld → new links are saved in scripts/photo-move-backup.json.");
await supabase.auth.signOut();
process.exit(problems.length || broken.length ? 1 : 0);
