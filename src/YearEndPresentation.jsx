import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    IconArrowBackUp,
    IconChevronLeft,
    IconChevronRight,
    IconFileTypePdf,
    IconPencil,
    IconPhoto,
    IconPresentation,
    IconX,
} from "@tabler/icons-react";
import { loadYearEnd, loadYearEndSettings, saveYearEndSettings } from "./yearEndData";
import { LINES, MAX_TITLE_PHOTOS, SHORT_MONTHS, lineOf, titleChoices, titleMonkeys, yearEndSlides } from "./yearEndRules";
import { intakeYears } from "./intakeReport";
import "./Modal.css"; // the buttons
import "./YearEndPresentation.css";

// The Year End Presentation (Admin Dashboard → Year End Presentation,
// #admin/year-end): a year's look back, for staff and volunteers, made from
// the records (yearEndRules.js). Each slide is 1280 × 720, scaled to fit:
// a preview here, Present (full screen: arrow keys, or tap the right or
// left of the screen), and Download PDF (the browser's Save as PDF, a slide
// a page). Admins can change the light-hearted lines (Edit Lines) and the
// title slide's monkeys (Change Photos), saved for that year
// (supabase/year-end.sql).

export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

// ---- The slides ----

function Photo({ monkey, size }) {
    const style = size ? { width: size, height: size } : undefined;
    return monkey?.photo ? (
        <img className="YE-photo" src={monkey.photo} alt="" style={style} />
    ) : (
        <span className="YE-photo is-none" style={style}>
            🐒<small>Photo soon</small>
        </span>
    );
}

// (a line, if it isn't empty)
const Line = ({ lines, k, className = "YE-line" }) => {
    const text = lineOf(lines, k);
    return text ? <p className={className}>{text}</p> : null;
};

function Head({ slide, lines, right = null, withLine = true }) {
    return (
        <div className="YE-head">
            <div>
                <div className="YE-kicker">{slide.kicker}</div>
                <h2 className="YE-title">{slide.title}</h2>
                {withLine && slide.lines?.[0] && <Line lines={lines} k={slide.lines[0]} />}
            </div>
            {right}
        </div>
    );
}

const Foot = ({ text = "" }) => (
    <div className="YE-foot">
        <span>{text}</span>
        <b>vervetDB</b>
    </div>
);

// The title: where its photos sit (up to five)
const COLLAGE = [
    { size: 230, right: 240, top: 110 },
    { size: 170, right: 80, top: 70 },
    { size: 190, right: 90, top: 300 },
    { size: 140, right: 330, top: 380 },
    { size: 120, right: 250, top: 545 },
];

function TitleSlide({ slide, lines }) {
    const year = String(slide.year);
    return (
        <div className="YE-slide YE-titleSlide">
            <div className="YE-sunburst" />
            {slide.monkeys.slice(0, COLLAGE.length).map((m, i) => (
                <span key={m.id} className="YE-collage" style={{ right: COLLAGE[i].right, top: COLLAGE[i].top }}>
                    <Photo monkey={m} size={COLLAGE[i].size} />
                </span>
            ))}
            <div className="YE-titleText">
                <div className="YE-year">
                    {year.slice(0, 2)}
                    <span>{year.slice(2)}</span>
                </div>
                <Line lines={lines} k="title.subtitle" className="YE-sub" />
                <Line lines={lines} k="title.tag" className="YE-tag" />
            </div>
            <Foot text="Vervet Monkey Foundation" />
        </div>
    );
}

function NumbersSlide({ slide, lines }) {
    return (
        <div className="YE-slide YE-pad">
            <div className="YE-kicker">{slide.year} at a glance</div>
            <h2 className="YE-title">The Year in Numbers</h2>
            <div className={`YE-tiles is-${slide.tiles.length > 6 ? "four" : "three"}`}>
                {slide.tiles.map((t, i) => (
                    <div key={t.key} className={`YE-tile is-c${i % 8}`}>
                        <span className="YE-emoji">{t.emoji}</span>
                        <div className="YE-n">{t.n.toLocaleString("en-GB")}</div>
                        <div className="YE-what">{t.what}</div>
                        <Line lines={lines} k={`numbers.${t.key}`} className="YE-quip" />
                        {t.note && <p className="YE-quip is-note">{t.note}</p>}
                    </div>
                ))}
            </div>
            <Foot />
        </div>
    );
}

function Bars({ bars }) {
    const top = Math.max(1, ...bars.map((b) => b.count));
    return (
        <ul className="YE-bars">
            {bars.map((b) => (
                <li key={b.label}>
                    <span className="YE-barLabel">{b.label}</span>
                    <span className="YE-barTrack">
                        <span className="YE-bar" style={{ width: `${(b.count / top) * 100}%` }} />
                    </span>
                    <span className="YE-barN">{b.count}</span>
                </li>
            ))}
        </ul>
    );
}

function Months({ months, busiest }) {
    const top = Math.max(1, ...months);
    return (
        <div className="YE-months" aria-hidden="true">
            {months.map((n, i) => (
                <span key={i} className="YE-monthCol">
                    <span className="YE-monthN">{n || ""}</span>
                    <span className={`YE-month${busiest?.month === i ? " is-max" : ""}`} style={{ height: `${Math.max(n ? 6 : 2, (n / top) * 100)}%` }} />
                    <span className="YE-monthLabel">{SHORT_MONTHS[i][0]}</span>
                </span>
            ))}
        </div>
    );
}

function ChartSlide({ slide, lines }) {
    return (
        <div className="YE-slide YE-pad">
            <Head slide={slide} lines={lines} />
            <div className="YE-chartGrid">
                <section>
                    <h3 className="YE-small">{slide.barsTitle}</h3>
                    <Bars bars={slide.bars} />
                </section>
                <section>
                    <h3 className="YE-small">
                        By month
                        {slide.busiest && (
                            <>
                                {" "}
                                · busiest: <b>{SHORT_MONTHS[slide.busiest.month]}</b>
                            </>
                        )}
                    </h3>
                    <Months months={slide.months} busiest={slide.busiest} />
                </section>
            </div>
            <Foot />
        </div>
    );
}

function MonkeysSlide({ slide, lines }) {
    return (
        <div className="YE-slide YE-pad YE-babies">
            <Head slide={slide} lines={lines} right={slide.note ? <p className="YE-note">{slide.note}</p> : null} />
            {/* (6 or fewer: one row, bigger) */}
            <ul className={`YE-grid${slide.tiles.length <= 6 ? " is-few" : ""}`}>
                {slide.tiles.map((t) => (
                    <li key={`${t.id}-${t.top}`} className="YE-baby">
                        <Photo monkey={t} />
                        <span className="YE-nm">{t.name}</span>
                        {t.top && <span className="YE-mo">{t.top}</span>}
                        {t.sub && <span className="YE-by">{t.sub}</span>}
                    </li>
                ))}
            </ul>
            <Foot />
        </div>
    );
}

function StatsSlide({ slide, lines }) {
    return (
        <div className="YE-slide YE-pad">
            <Head slide={slide} lines={lines} />
            <div className={`YE-statsGrid${slide.groups.length === 1 ? " is-single" : ""}`}>
                {slide.groups.map((g) => (
                    <section key={g.title}>
                        <h3 className="YE-small">{g.title}</h3>
                        <Bars bars={g.bars.slice(0, 6)} />
                    </section>
                ))}
                <section className="YE-statFacts">
                    {slide.facts.map((f) => (
                        <div key={f.label} className="YE-statFact">
                            <span>{f.label}</span>
                            <b>{f.value}</b>
                        </div>
                    ))}
                </section>
            </div>
            <Foot />
        </div>
    );
}

function CardsSlide({ slide, lines, stamp = false }) {
    return (
        <div className="YE-slide YE-pad YE-facts">
            {stamp && <Line lines={lines} k="facts.stamp" className="YE-stamp" />}
            <Head slide={slide} lines={lines} withLine={!stamp} />
            <div className="YE-cards">
                {slide.cards.map((c) => (
                    <div key={c.label} className="YE-card">
                        <div className="YE-cardEmoji">{c.emoji}</div>
                        <div className="YE-big">
                            {c.big}
                            {c.unit && <small>{c.unit}</small>}
                        </div>
                        <div className="YE-lab">{c.label}</div>
                        {c.who && <div className="YE-who">{c.who}</div>}
                        {c.key && <Line lines={lines} k={`facts.${c.key}`} className="YE-who is-quip" />}
                    </div>
                ))}
            </div>
            <Foot />
        </div>
    );
}

function ThanksSlide({ slide, lines }) {
    return (
        <div className="YE-slide YE-thanks">
            <div className="YE-thanksPhotos">
                {slide.monkeys.slice(0, 5).map((m) => (
                    <Photo key={m.id} monkey={m} size={120} />
                ))}
            </div>
            <Line lines={lines} k="thanks.title" className="YE-thanksTitle" />
            <Line lines={lines} k="thanks.message" className="YE-thanksMessage" />
            <Foot text={`Here's to ${slide.year + 1}!`} />
        </div>
    );
}

export function Slide({ slide, lines }) {
    switch (slide.kind) {
        case "title":
            return <TitleSlide slide={slide} lines={lines} />;
        case "numbers":
            return <NumbersSlide slide={slide} lines={lines} />;
        case "chart":
            return <ChartSlide slide={slide} lines={lines} />;
        case "monkeys":
            return <MonkeysSlide slide={slide} lines={lines} />;
        case "stats":
            return <StatsSlide slide={slide} lines={lines} />;
        case "facts":
            return <CardsSlide slide={slide} lines={lines} stamp />;
        case "busy":
            return <CardsSlide slide={slide} lines={lines} />;
        default:
            return <ThanksSlide slide={slide} lines={lines} />;
    }
}

// A slide scaled to the width it's given
function Stage({ slide, lines }) {
    const ref = useRef(null);
    const [scale, setScale] = useState(0.5);
    useEffect(() => {
        const box = ref.current;
        if (!box) return undefined;
        const fit = () => box.clientWidth && setScale(box.clientWidth / SLIDE_WIDTH);
        fit();
        if (typeof ResizeObserver === "undefined") return undefined;
        const watch = new ResizeObserver(fit);
        watch.observe(box);
        return () => watch.disconnect();
    }, []);
    return (
        <div className="YearEnd-stage" ref={ref} style={{ height: SLIDE_HEIGHT * scale }}>
            <div className="YearEnd-scaled" style={{ transform: `scale(${scale})` }}>
                <Slide slide={slide} lines={lines} />
            </div>
        </div>
    );
}

// ---- Present: full screen ----

function Presenter({ slides, lines, start, onClose }) {
    const ref = useRef(null);
    const [at, setAt] = useState(start);
    const fitScale = () => Math.min(window.innerWidth / SLIDE_WIDTH, window.innerHeight / SLIDE_HEIGHT);
    const [scale, setScale] = useState(fitScale);
    const go = useCallback((step) => setAt((i) => Math.min(slides.length - 1, Math.max(0, i + step))), [slides.length]);

    useEffect(() => {
        ref.current?.requestFullscreen?.().catch(() => {});
        const onKey = (event) => {
            if (["ArrowRight", "PageDown", " ", "Enter"].includes(event.key)) go(1);
            else if (["ArrowLeft", "PageUp", "Backspace"].includes(event.key)) go(-1);
            else if (event.key === "Home") setAt(0);
            else if (event.key === "End") setAt(slides.length - 1);
            else if (event.key === "Escape") onClose();
            else return;
            event.preventDefault();
        };
        const onResize = () => setScale(fitScale());
        // (leaving full screen with the browser's own Esc: closed too)
        const onFull = () => !document.fullscreenElement && onClose();
        window.addEventListener("keydown", onKey);
        window.addEventListener("resize", onResize);
        document.addEventListener("fullscreenchange", onFull);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onResize);
            document.removeEventListener("fullscreenchange", onFull);
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        };
    }, [go, onClose, slides.length]);

    return (
        <div
            className="YearEnd-present"
            ref={ref}
            role="dialog"
            aria-label="Year End Presentation"
            onClick={(event) => go(event.clientX < window.innerWidth / 3 ? -1 : 1)}
        >
            <div className="YearEnd-scaled" style={{ transform: `scale(${scale})` }}>
                <Slide slide={slides[at]} lines={lines} />
            </div>
            <span className="YearEnd-count">
                {at + 1} / {slides.length}
            </span>
            <button
                type="button"
                className="YearEnd-close"
                aria-label="Stop Presenting"
                title="Stop Presenting (Esc)"
                onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                }}
            >
                <IconX size={22} aria-hidden="true" />
            </button>
        </div>
    );
}

// ---- Download PDF: every slide, a page each, for the browser's Save as PDF ----

function PrintSlides({ slides, lines, onDone }) {
    useEffect(() => {
        const images = [...document.querySelectorAll(".YearEnd-print img")];
        // (every photo loaded first, or 8 seconds at most)
        const loaded = images
            .filter((img) => !img.complete)
            .map(
                (img) =>
                    new Promise((ok) => {
                        img.addEventListener("load", ok, { once: true });
                        img.addEventListener("error", ok, { once: true });
                    })
            );
        let gone = false;
        Promise.race([Promise.all(loaded), new Promise((ok) => setTimeout(ok, 8000))]).then(() => {
            if (gone) return;
            window.print();
            onDone();
        });
        return () => {
            gone = true;
        };
    }, [onDone]);
    return createPortal(
        <div className="YearEnd-print">
            {slides.map((s) => (
                <div key={s.id} className="YearEnd-printPage">
                    <Slide slide={s} lines={lines} />
                </div>
            ))}
        </div>,
        document.body
    );
}

// ---- Edit Lines: the current slide's lines ----

function EditLines({ keys, lines, setLines }) {
    if (!keys.length) return <p className="Admin-note">This slide has no lines to change.</p>;
    return (
        <div className="YearEnd-lines">
            {keys.map((key) => {
                const line = LINES[key];
                const value = lineOf(lines, key);
                const changed = key in lines && lines[key] !== line.text;
                const long = line.max > 120;
                const set = (event) => setLines((all) => ({ ...all, [key]: event.target.value }));
                return (
                    <div key={key} className="YearEnd-lineRow">
                        <label className="YearEnd-lineField">
                            <span>{line.label}</span>
                            {long ? (
                                <textarea value={value} maxLength={line.max} rows={3} onChange={set} placeholder="(not shown)" />
                            ) : (
                                <input type="text" value={value} maxLength={line.max} onChange={set} placeholder="(not shown)" />
                            )}
                        </label>
                        {changed && (
                            <button
                                type="button"
                                className="Integration-icon"
                                aria-label={`Use the app's words: ${line.label}`}
                                title={`Use the app's words${line.text ? `: "${line.text}"` : ""}`}
                                onClick={() =>
                                    setLines((all) => {
                                        const rest = { ...all };
                                        delete rest[key];
                                        return rest;
                                    })
                                }
                            >
                                <IconArrowBackUp size={17} aria-hidden="true" />
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ---- Change Photos: the title slide's monkeys, from the year's ----

function ChangePhotos({ choices, chosen, setChosen }) {
    const toggle = (id) =>
        setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length < MAX_TITLE_PHOTOS ? [...list, id] : list));
    if (!choices.length) return <p className="Admin-note">No monkeys from this year have photos yet.</p>;
    return (
        <>
            <p className="Admin-note">
                Choose up to {MAX_TITLE_PHOTOS}, in the order you want them: {chosen.length} of {MAX_TITLE_PHOTOS} chosen. They&apos;re on the
                Thank You slide too.
            </p>
            <ul className="YearEnd-choices">
                {choices.map((m) => {
                    const at = chosen.indexOf(m.id);
                    return (
                        <li key={m.id}>
                            <button
                                type="button"
                                className={`YearEnd-choice${at >= 0 ? " is-on" : ""}`}
                                aria-pressed={at >= 0}
                                disabled={at < 0 && chosen.length >= MAX_TITLE_PHOTOS}
                                onClick={() => toggle(m.id)}
                            >
                                <img src={m.photo} alt="" />
                                <span>{m.name}</span>
                                {at >= 0 && <b className="YearEnd-order">{at + 1}</b>}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}

// ---- The page ----

export default function YearEndPresentation() {
    const years = intakeYears();
    const [year, setYear] = useState(years[0]);
    // null (loading), { problem }, or { facts, settings }
    const [data, setData] = useState(null);
    const [at, setAt] = useState(0);
    // the lines and title photos as they are being changed (saved: Save)
    const [lines, setLines] = useState({});
    const [chosen, setChosen] = useState([]);
    // null, "lines" or "photos"
    const [panel, setPanel] = useState(null);
    const [presenting, setPresenting] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        let current = true;
        setData(null);
        setAt(0);
        setPanel(null);
        setMessage(null);
        Promise.all([loadYearEnd(year), loadYearEndSettings(year)])
            .then(([facts, settings]) => {
                if (!current) return;
                setData({ facts, settings });
                setLines(settings.lines);
                setChosen(titleMonkeys(facts, year, settings.titlePhotos).map((m) => m.id));
            })
            .catch((error) => current && setData({ problem: error.message }));
        return () => {
            current = false;
        };
    }, [year]);

    const slides = useMemo(() => (data?.facts ? yearEndSlides(data.facts, year, { titlePhotos: chosen }) : []), [data, year, chosen]);
    const choices = useMemo(() => (data?.facts ? titleChoices(data.facts, year) : []), [data, year]);
    const stopPrinting = useCallback(() => setPrinting(false), []);
    const stopPresenting = useCallback(() => setPresenting(false), []);
    const slide = slides[Math.min(at, slides.length - 1)];
    const saved = data?.settings;
    const unsaved =
        Boolean(saved) &&
        (JSON.stringify(lines) !== JSON.stringify(saved.lines) ||
            (panel === "photos" && JSON.stringify(chosen) !== JSON.stringify(titleMonkeys(data.facts, year, saved.titlePhotos).map((m) => m.id))));

    async function save() {
        setSaving(true);
        setMessage(null);
        try {
            await saveYearEndSettings(year, { lines, titlePhotos: chosen });
            setData((d) => ({ ...d, settings: { ...d.settings, lines, titlePhotos: chosen } }));
            setMessage({ ok: true, text: "Saved." });
        } catch (error) {
            setMessage({ ok: false, text: error.message });
        }
        setSaving(false);
    }

    return (
        <div className="YearEnd">
            <div className="YearEnd-bar">
                <label className="IntegrationPage-choose YearEnd-year">
                    <span>Year</span>
                    <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                        {years.map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                </label>
                {slides.length > 0 && (
                    <div className="YearEnd-actions">
                        <button type="button" className="Modal-edit is-confirm" onClick={() => setPresenting(true)}>
                            <IconPresentation size={18} aria-hidden="true" />
                            Present
                        </button>
                        <button type="button" className="Modal-edit is-blue-outline" onClick={() => setPrinting(true)} disabled={printing}>
                            <IconFileTypePdf size={18} aria-hidden="true" />
                            {printing ? "Preparing…" : "Download PDF"}
                        </button>
                    </div>
                )}
            </div>
            {data === null ? (
                <p className="Admin-note">Loading {year}…</p>
            ) : data.problem ? (
                <p className="RecordsPage-problem" role="alert">
                    {data.problem}
                </p>
            ) : (
                <>
                    <Stage slide={slide} lines={lines} />
                    <div className="YearEnd-nav">
                        <button type="button" className="Modal-edit is-blue-outline" aria-label="Previous Slide" disabled={at === 0} onClick={() => setAt(at - 1)}>
                            <IconChevronLeft size={20} aria-hidden="true" />
                        </button>
                        <span className="YearEnd-where" aria-live="polite">
                            Slide {at + 1} of {slides.length}
                        </span>
                        <button
                            type="button"
                            className="Modal-edit is-blue-outline"
                            aria-label="Next Slide"
                            disabled={at >= slides.length - 1}
                            onClick={() => setAt(at + 1)}
                        >
                            <IconChevronRight size={20} aria-hidden="true" />
                        </button>
                        <span className="YearEnd-tools">
                            <button
                                type="button"
                                className="Modal-edit is-action-outline"
                                aria-pressed={panel === "lines"}
                                onClick={() => setPanel(panel === "lines" ? null : "lines")}
                            >
                                <IconPencil size={18} aria-hidden="true" />
                                Edit Lines
                            </button>
                            {slide?.kind === "title" || slide?.kind === "thanks" ? (
                                <button
                                    type="button"
                                    className="Modal-edit is-action-outline"
                                    aria-pressed={panel === "photos"}
                                    onClick={() => setPanel(panel === "photos" ? null : "photos")}
                                >
                                    <IconPhoto size={18} aria-hidden="true" />
                                    Change Photos
                                </button>
                            ) : null}
                        </span>
                    </div>
                    {panel && (
                        <section className="Admin-card YearEnd-panel" aria-label={panel === "lines" ? "Edit Lines" : "Change Photos"}>
                            {panel === "lines" ? (
                                <EditLines keys={slide?.lines ?? []} lines={lines} setLines={setLines} />
                            ) : (
                                <ChangePhotos choices={choices} chosen={chosen} setChosen={setChosen} />
                            )}
                            {!saved.ready && (
                                <p className="RecordsPage-hint">Changes show here, but can&apos;t be saved until supabase/year-end.sql has been run.</p>
                            )}
                            {message && (
                                <p className={message.ok ? "YearEnd-saved" : "RecordsPage-problem"} role={message.ok ? "status" : "alert"}>
                                    {message.text}
                                </p>
                            )}
                            <div className="RecordsPage-actions">
                                <button type="button" className="Modal-edit is-confirm" disabled={saving || !saved.ready} onClick={save}>
                                    {saving ? "Saving…" : "Save"}
                                </button>
                                <button type="button" className="Modal-edit is-cancel" onClick={() => setPanel(null)}>
                                    Close
                                </button>
                                {unsaved && <span className="YearEnd-unsaved">Not saved yet</span>}
                            </div>
                        </section>
                    )}
                    <p className="RecordsPage-hint">
                        Present: arrow keys or space to move on, Esc to stop; on a touch screen, tap the right of the screen to go on, the left to go back.
                        Download PDF opens your browser&apos;s print window: choose Save as PDF, with Background graphics on.
                    </p>
                </>
            )}
            {presenting && slides.length > 0 && <Presenter slides={slides} lines={lines} start={Math.min(at, slides.length - 1)} onClose={stopPresenting} />}
            {printing && slides.length > 0 && <PrintSlides slides={slides} lines={lines} onDone={stopPrinting} />}
        </div>
    );
}
