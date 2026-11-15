// The Year End Presentation's data (YearEndPresentation.jsx, admins): the
// year's records, as plain facts for yearEndRules.js to make slides from;
// and the year's own lines and title photos (supabase/year-end.sql).
// Anything that can't be read (a table not there yet) is left out: its
// slide or number just doesn't show.
import { supabase } from "./supabase";
import { isPlaceholderPhoto } from "./photoPaths";

const span = (year) => [`${year}-01-01`, `${year}-12-31`];

// (a list, or [] when it can't be read)
async function rows(query, what) {
    const { data, error } = await query;
    if (error) {
        console.error(`Year End: reading ${what} failed:`, error);
        return null;
    }
    return data;
}

// (how many, or null when it can't be read)
async function count(query, what) {
    const { count: n, error } = await query;
    if (error) {
        console.error(`Year End: counting ${what} failed:`, error);
        return null;
    }
    return n ?? 0;
}

// A monkey's first real photo, or null (the grey blank isn't one)
export const realPhoto = (photos) => (photos ?? []).find((url) => url && !isPlaceholderPhoto(url)) ?? null;

// Photos added in the year: the time each one was added is in its name
// ("masko-1793198960054.jpg")
export function photosAddedIn(monkeys, year) {
    let n = 0;
    for (const m of monkeys) {
        for (const url of m.photos ?? []) {
            const stamp = /-(\d{13})\.[a-z]+$/i.exec(url ?? "");
            if (stamp && new Date(Number(stamp[1])).getFullYear() === year) n += 1;
        }
    }
    return n;
}

const toMonkey = (row) => ({
    id: row.id,
    name: row.name,
    sex: row.sex,
    year: row.birth_year ?? null,
    birthDate: row.birth_date ?? null,
    arrivalDate: row.arrival_date ?? null,
    arrivalReason: row.arrival_reason ?? null,
    status: row.status ?? null,
    statusOn: row.status_on ?? row.released_on ?? null,
    statusDetails: row.status_details ?? row.release_details ?? null,
    troop: row.troops?.name ?? null,
    photos: row.photos ?? [],
    photo: realPhoto(row.photos),
});

// Everything for a year (admins: archived monkeys too):
//   { monkeys, namedBy: { monkeyId: name }, integrations, vetVisits,
//     vasectomies, milk, weights, counts: { deworming, microchips,
//     sessions, sightings, maintenance, weeklyReports, photos } }
export async function loadYearEnd(year) {
    const [from, to] = span(year);
    const monkeyRows = await rows(
        supabase
            .from("monkeys")
            .select(
                "id, name, sex, birth_year, birth_date, arrival_date, arrival_reason, status, status_on, status_details, released_on, release_details, photos, troops(name)"
            )
            .order("id"),
        "monkeys"
    );
    if (!monkeyRows) throw new Error("Couldn't read the monkeys just now. Please check your connection and try again.");
    const monkeys = monkeyRows.map(toMonkey);
    const arrived = monkeys.filter((m) => m.arrivalDate >= from && m.arrivalDate <= to).map((m) => m.id);

    const [namedRows, integrations, vetVisits, vasectomies, milk, weights, ...counted] = await Promise.all([
        arrived.length ? rows(supabase.from("named_by").select("monkey_id, name").in("monkey_id", arrived), "names") : [],
        rows(
            supabase.from("integrations").select("id, monkey_id, started_on, kind, status, place").gte("started_on", from).lte("started_on", to).order("started_on"),
            "integrations"
        ).then(
            (found) =>
                found ??
                rows(
                    supabase.from("integrations").select("id, monkey_id, started_on, kind, status").gte("started_on", from).lte("started_on", to).order("started_on"),
                    "integrations"
                )
        ),
        rows(supabase.from("vet_visits").select("id, monkey_id, visit_date, practice, practice_other, reason").gte("visit_date", from).lte("visit_date", to), "vet visits"),
        rows(supabase.from("vasectomies").select("id, monkey_id, done_on, vet, vet_other").gte("done_on", from).lte("done_on", to), "vasectomies"),
        rows(supabase.from("milk_totals").select("monkey_id, milk_date, total_ml").gte("milk_date", from).lte("milk_date", to), "milk totals"),
        rows(supabase.from("weights").select("monkey_id, weigh_date, grams").gte("weigh_date", from).lte("weigh_date", to), "weights"),
        count(
            supabase.from("monkey_records").select("id", { count: "exact", head: true }).eq("category", "deworming").gte("record_date", from).lte("record_date", to),
            "deworming"
        ),
        count(
            supabase.from("monkey_records").select("id", { count: "exact", head: true }).eq("category", "microchip").gte("record_date", from).lte("record_date", to),
            "microchips"
        ),
        count(
            supabase
                .from("monitoring_sessions")
                .select("id", { count: "exact", head: true })
                .eq("status", "finished")
                .gte("session_date", from)
                .lte("session_date", to),
            "monitoring sessions"
        ),
        count(
            supabase
                .from("monitoring_sightings")
                .select("seen, monitoring_sessions!inner(session_date, status)", { count: "exact", head: true })
                .eq("seen", true)
                .eq("monitoring_sessions.status", "finished")
                .gte("monitoring_sessions.session_date", from)
                .lte("monitoring_sessions.session_date", to),
            "sightings"
        ),
        count(supabase.from("maintenance").select("id", { count: "exact", head: true }).gte("done_on", from).lte("done_on", to), "maintenance"),
        count(
            supabase
                .from("baby_weekly_reports")
                .select("id", { count: "exact", head: true })
                .not("report", "is", null)
                .gte("week_start", from)
                .lte("week_start", to),
            "weekly baby reports"
        ),
    ]);
    const [deworming, microchips, sessions, sightings, maintenance, weeklyReports] = counted;
    const namedBy = {};
    for (const row of namedRows ?? []) if (row.name?.trim()) namedBy[row.monkey_id] = row.name.trim();
    return {
        monkeys,
        namedBy,
        integrations: (integrations ?? []).map((r) => ({
            id: r.id,
            monkeyId: r.monkey_id,
            startedOn: r.started_on,
            kind: r.kind,
            status: r.status,
            place: r.place ?? null,
        })),
        vetVisits: vetVisits && vetVisits.map((r) => ({ monkeyId: r.monkey_id, date: r.visit_date, practice: r.practice, practiceOther: r.practice_other ?? "", reason: r.reason })),
        vasectomies: vasectomies && vasectomies.map((r) => ({ monkeyId: r.monkey_id, date: r.done_on, vet: r.vet, vetOther: r.vet_other ?? "" })),
        milk: (milk ?? []).map((r) => ({ monkeyId: r.monkey_id, date: r.milk_date, ml: r.total_ml })),
        weights: (weights ?? []).map((r) => ({ monkeyId: r.monkey_id, date: r.weigh_date, grams: r.grams })),
        counts: { deworming, microchips, sessions, sightings, maintenance, weeklyReports, photos: photosAddedIn(monkeys, year) },
    };
}

// ---- The year's own words and title photos (year-end.sql) ----

const notReady = (error) => ["42P01", "PGRST205"].includes(error?.code);

// { lines: { key: text }, titlePhotos: [monkeyId], ready } (ready: false
// before year-end.sql has run: the app's own lines, nothing to save to)
export async function loadYearEndSettings(year) {
    const { data, error } = await supabase.from("year_end_presentations").select("lines, title_photos").eq("year", year).maybeSingle();
    if (error) {
        if (!notReady(error)) console.error("Year End: reading its settings failed:", error);
        return { lines: {}, titlePhotos: null, ready: !notReady(error) };
    }
    return { lines: data?.lines ?? {}, titlePhotos: data?.title_photos ?? null, ready: true };
}

export async function saveYearEndSettings(year, { lines, titlePhotos }) {
    const row = { year, lines };
    if (titlePhotos) row.title_photos = titlePhotos;
    const { error } = await supabase.from("year_end_presentations").upsert(row, { onConflict: "year" });
    if (error) {
        console.error("Year End: saving failed:", error);
        if (notReady(error)) throw new Error("Please run supabase/year-end.sql first.");
        if (error.code === "42501") throw new Error("The database didn't allow this. Are you still signed in as an admin?");
        throw new Error("Couldn't save that just now. Please check your connection and try again.");
    }
}
