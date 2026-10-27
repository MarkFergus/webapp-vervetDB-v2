import { useCallback, useEffect, useState } from "react";
import { IconMars, IconMinus, IconPlus, IconSearch, IconVenus } from "@tabler/icons-react";
import { loadArchive } from "./monkeyData";
import { summaryDate } from "./feeding";
import { placeName } from "./places";
import { isPlaceholderPhoto, thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import { ARCHIVED, STATUS_WORDS, archivePageHash } from "./monkeyStatus";
import "./MonkeyArchive.css";

// The Monkey Archive (Admin Dashboard, admins only): every monkey no longer
// at the sanctuary (Deceased, Escaped, Missing, Released), newest status
// change first. A row opens the monkey's Full Profile (there's no pop-up);
// its + shows the details and every status change underneath.

const dayText = (date) => summaryDate(new Date(`${date}T00:00:00`));

// The archive, loaded when it's first needed and kept while moving between
// the list and a profile. list: null (loading), "failed", "not-ready" (the
// database hasn't got it yet: monkey-archive.sql) or the monkeys.
export function useArchive(enabled) {
    const [list, setList] = useState(null);
    const reload = useCallback(async () => {
        try {
            setList(await loadArchive());
        } catch (error) {
            console.error("Loading the Monkey Archive failed:", error);
            setList(error?.code === "42703" || error?.code === "PGRST204" ? "not-ready" : "failed");
        }
    }, []);
    useEffect(() => {
        if (enabled && list === null) reload();
    }, [enabled, list, reload]);
    return { list, reload };
}

// Newest status change first (no date: last), then by name
const byNewest = (a, b) => (b.statusOn ?? "").localeCompare(a.statusOn ?? "") || a.name.localeCompare(b.name);

function matches(monkey, words) {
    if (!words) return true;
    const text = [monkey.name, placeName(monkey), monkey.chip ?? ""].join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
}

const chipText = (chip) => (chip === null ? "Unknown" : chip || "No Chip");

function StatusPill({ status }) {
    return <span className={`Archive-status is-${status}`}>{STATUS_WORDS[status] ?? status}</span>;
}

function ArchiveRow({ monkey, open, onToggle }) {
    const photo = Array.isArray(monkey.img) ? monkey.img[0] : monkey.img;
    const SexIcon = monkey.sex === "male" ? IconMars : monkey.sex === "female" ? IconVenus : null;
    const sexWord = monkey.sex === "male" ? "Male" : monkey.sex === "female" ? "Female" : "Unknown";
    const detailsId = `Archive-details-${monkey.id}`;
    return (
        <li className={`Archive-item${open ? " is-open" : ""}`}>
            <div className="Archive-row">
                <span className="Archive-photo">
                    {typeof photo === "string" && photo && !isPlaceholderPhoto(photo) && (
                        <img src={thumbUrl(photo)} alt="" loading="lazy" onError={fallbackTo(photo)} />
                    )}
                </span>
                {/* (the name's link covers the whole row: Archive-link) */}
                <span className="Archive-main">
                    <a className="Archive-link" href={archivePageHash(monkey)}>
                        {monkey.name}
                    </a>
                    {/* Phones: the details under the name */}
                    <span className="Archive-meta">
                        <span>{placeName(monkey) || "None"}</span>
                        {SexIcon && (
                            <span>
                                <SexIcon size={14} stroke={2} aria-label={sexWord} />
                            </span>
                        )}
                        {monkey.year && <span>{monkey.year}</span>}
                    </span>
                </span>
                <span className="Archive-wide">{placeName(monkey) || "None"}</span>
                {/* (just the symbol: more room for the name) */}
                <span className="Archive-wide Archive-sex" title={sexWord}>
                    {SexIcon ? <SexIcon size={16} stroke={2} aria-label={sexWord} /> : <span aria-label={sexWord}>–</span>}
                </span>
                <span className="Archive-wide">{monkey.year || "–"}</span>
                <span className="Archive-wide Archive-chip">{chipText(monkey.chip)}</span>
                <span className="Archive-wide">{monkey.statusOn ? dayText(monkey.statusOn) : "–"}</span>
                <span className="Archive-wide">
                    <StatusPill status={monkey.status} />
                </span>
                {/* Phones: the status, with its date under it */}
                <span className="Archive-when">
                    <StatusPill status={monkey.status} />
                    <span className="Archive-date">{monkey.statusOn ? dayText(monkey.statusOn) : "–"}</span>
                </span>
                <button
                    type="button"
                    className="Archive-toggle"
                    onClick={onToggle}
                    aria-expanded={open}
                    aria-controls={detailsId}
                    aria-label={`${open ? "Hide" : "Show"} details for ${monkey.name}`}
                    title={open ? "Hide Details" : "Show Details"}
                >
                    {open ? <IconMinus size={16} stroke={2.25} /> : <IconPlus size={16} stroke={2.25} />}
                </button>
            </div>
            {open && (
                <div className="Archive-details" id={detailsId}>
                    {/* (phones: the chip has no column) */}
                    <p className="Archive-chipLine">
                        <span>Chip:</span> {chipText(monkey.chip)}
                    </p>
                    <h3>Details</h3>
                    <p className={monkey.statusDetails ? "Archive-text" : "Archive-none"}>
                        {monkey.statusDetails || "No details given."}
                    </p>
                    <h3>Status Changes</h3>
                    {monkey.statusChanges?.length ? (
                        <ul className="Archive-changes">
                            {monkey.statusChanges.map((c) => (
                                <li key={c.id}>
                                    <span className="Archive-changeDate">{dayText(c.date)}</span>
                                    <span className="Archive-changeText">
                                        {c.details}
                                        <span className="Archive-by"> ({c.by ?? "Staff"})</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="Archive-none">None recorded.</p>
                    )}
                </div>
            )}
        </li>
    );
}

// list: useArchive's
export function ArchiveList({ list }) {
    const [search, setSearch] = useState("");
    // "all", or one status
    const [show, setShow] = useState("all");
    const [open, setOpen] = useState(() => new Set());
    if (list === null) return <p className="Admin-note">Loading the Monkey Archive…</p>;
    if (list === "not-ready") {
        return <p className="Admin-note is-error">The Monkey Archive needs supabase/monkey-archive.sql to be run first.</p>;
    }
    if (list === "failed") {
        return <p className="Admin-note is-error">Couldn't load the Monkey Archive. Please check your connection and try again.</p>;
    }
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const count = (status) => list.filter((m) => m.status === status).length;
    const shown = list.filter((m) => (show === "all" || m.status === show) && matches(m, words)).sort(byNewest);
    const toggle = (id) =>
        setOpen((o) => {
            const next = new Set(o);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    return (
        <>
            <div className="Archive-tools">
                <label className="Archive-search">
                    <IconSearch size={16} aria-hidden="true" />
                    <span className="Admin-visuallyHidden">Search the Monkey Archive</span>
                    <input
                        type="search"
                        value={search}
                        placeholder="Search name, home or chip"
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </label>
                <div className="Archive-pills" role="group" aria-label="Status">
                    {["all", ...ARCHIVED].map((status) => (
                        <button
                            key={status}
                            type="button"
                            className={`Archive-pill${show === status ? " is-active" : ""}`}
                            aria-pressed={show === status}
                            onClick={() => setShow(status)}
                        >
                            {status === "all" ? "All" : STATUS_WORDS[status]}
                            <span className="Archive-pillCount">{status === "all" ? list.length : count(status)}</span>
                        </button>
                    ))}
                </div>
            </div>
            {!list.length ? (
                <p className="Admin-note">No monkeys in the archive yet.</p>
            ) : !shown.length ? (
                <p className="Admin-note">No archived monkeys match.</p>
            ) : (
                <div className="Archive-list">
                    <div className="Archive-row Archive-header" aria-hidden="true">
                        <span />
                        <span>Name</span>
                        <span className="Archive-wide">Home</span>
                        <span className="Archive-wide Archive-sex">Sex</span>
                        <span className="Archive-wide">Born</span>
                        <span className="Archive-wide">Chip</span>
                        <span className="Archive-wide">Date</span>
                        <span className="Archive-wide">Status</span>
                        <span />
                    </div>
                    <ul className="Archive-items">
                        {shown.map((monkey) => (
                            <ArchiveRow key={monkey.id} monkey={monkey} open={open.has(monkey.id)} onToggle={() => toggle(monkey.id)} />
                        ))}
                    </ul>
                </div>
            )}
        </>
    );
}
