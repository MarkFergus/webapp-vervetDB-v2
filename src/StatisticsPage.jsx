import { useEffect, useId, useRef, useState } from "react";
import { IconChartBar, IconSortAscending, IconSortDescending, IconTable } from "@tabler/icons-react";
import { bySection, hasTroop, isCareUnit, isInside, sizeText } from "./enclosures";
import { fullName } from "./places";
import { SPECIES } from "./species";
import { hasFeeding } from "./feeding";
import { loadMilkTotals } from "./monkeyData";
import {
    BANDITS,
    PARTS,
    STAT_AGE_GROUPS,
    amPlatesFor,
    banditMonkeys,
    countsByEnclosure,
    countsBySection,
    monkeysIn,
    percent,
    ranked,
    BABY_CARE,
    babyAgeText,
    milkPerDay,
    sectionLabel,
    weightPerWeek,
    youngestOldest,
    sexByTroop,
    spaceByEnclosure,
    spacePerMonkey,
    statsFor,
} from "./stats";
import "./StatisticsPage.css";

// The Statistics page (#statistics): figures and charts for the whole
// sanctuary, or one enclosure (its troop, its introcages, or both). For
// everyone, for now. Charts drawn here (no chart library): number tiles,
// part-to-whole bars, age columns, and bar lists (space per monkey, AM
// plates, where the monkeys live). Current figures only, for now. Every chart has a Table view with the same numbers, and a hover /
// focus tooltip on each mark.
// (Colours: StatisticsPage.css, checked for colour-blind readers in both
// themes. Baby Care's weights and milk come later, once they're recorded.)

// "62%", "1 monkey", "12 monkeys"
const monkeysWord = (n) => `${n} ${n === 1 ? "monkey" : "monkeys"}`;

// A tooltip that follows the pointer (or sits by a focused mark): the
// value first, then what it is
function useTooltip() {
    const [tip, setTip] = useState(null);
    const show = (event, value, label) => {
        const point =
            event.clientX !== undefined && event.type.startsWith("pointer")
                ? { x: event.clientX, y: event.clientY }
                : (() => {
                      const box = event.currentTarget.getBoundingClientRect();
                      return { x: box.left + box.width / 2, y: box.top };
                  })();
        setTip({ ...point, value, label });
    };
    const hide = () => setTip(null);
    // Props for a mark: hover and keyboard focus both show it
    const markProps = (value, label) => ({
        tabIndex: 0,
        "aria-label": `${label}: ${value}`,
        onPointerEnter: (e) => show(e, value, label),
        onPointerMove: (e) => show(e, value, label),
        onPointerLeave: hide,
        onFocus: (e) => show(e, value, label),
        onBlur: hide,
    });
    const element = tip && (
        <div className="Stats-tooltip" role="presentation" style={{ left: tip.x, top: tip.y }}>
            <strong>{tip.value}</strong>
            <span>{tip.label}</span>
        </div>
    );
    return { markProps, element };
}

// A chart in a card: its title, the headline in words, the chart (or, with
// Table, the same numbers as a table)
//   table: { columns: [..], rows: [[..], ..] }
//   sort: a ranked list's order: { highFirst, onToggle } (High to Low, or
//   Low to High)
function Card({ title, headline, table, sort, wide = false, children }) {
    const [asTable, setAsTable] = useState(false);
    const id = useId();
    return (
        <section className={`Stats-card${wide ? " is-wide" : ""}`} aria-labelledby={id}>
            <div className="Stats-cardHead">
                <h2 id={id}>{title}</h2>
                {sort && (
                    <button
                        type="button"
                        className="Stats-viewToggle Stats-sortToggle"
                        onClick={sort.onToggle}
                        title={sort.highFirst ? "Showing highest first: tap for lowest first" : "Showing lowest first: tap for highest first"}
                    >
                        {sort.highFirst ? (
                            <IconSortDescending size={16} aria-hidden="true" />
                        ) : (
                            <IconSortAscending size={16} aria-hidden="true" />
                        )}
                        {/* (phones: just the arrow; it's still read out) */}
                        <span className="Stats-sortLabel">{sort.highFirst ? "High to Low" : "Low to High"}</span>
                    </button>
                )}
                <button
                    type="button"
                    className="Stats-viewToggle"
                    onClick={() => setAsTable((t) => !t)}
                    aria-pressed={asTable}
                    title={asTable ? "Show Chart" : "Show Table"}
                >
                    {asTable ? <IconChartBar size={16} aria-hidden="true" /> : <IconTable size={16} aria-hidden="true" />}
                    {asTable ? "Chart" : "Table"}
                </button>
            </div>
            {headline && <p className="Stats-headline">{headline}</p>}
            {asTable ? (
                <table className="Stats-table">
                    <thead>
                        <tr>
                            {table.columns.map((c) => (
                                <th key={c} scope="col">
                                    {c}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {table.rows.map((row) => (
                            <tr key={row[0]}>
                                {row.map((cell, i) =>
                                    i === 0 ? (
                                        <th key={i} scope="row">
                                            {cell}
                                        </th>
                                    ) : (
                                        <td key={i}>{cell}</td>
                                    )
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                children
            )}
        </section>
    );
}

// Part of a whole, as one bar split into its parts (a 2px gap between
// them), with a legend under it: a swatch, the name, the number and %
//   parts: [{ key, label, value }] (colour: .is-<key> in the CSS)
function PartsBar({ parts, total }) {
    const tooltip = useTooltip();
    const shown = parts.filter((p) => p.value > 0);
    return (
        <>
            <div className="Stats-parts">
                {shown.map((p) => (
                    <span
                        key={p.key}
                        className={`Stats-part is-${p.key}`}
                        style={{ flexGrow: p.value }}
                        {...tooltip.markProps(`${p.value} (${percent(p.value, total)}%)`, p.label)}
                    />
                ))}
            </div>
            <ul className="Stats-legend">
                {parts.map((p) => (
                    <li key={p.key}>
                        <span className={`Stats-swatch is-${p.key}`} aria-hidden="true" />
                        <span className="Stats-legendLabel">{p.label}</span>
                        <span className="Stats-legendValue">
                            {p.value} <span className="Stats-muted">({percent(p.value, total)}%)</span>
                        </span>
                    </li>
                ))}
            </ul>
            {tooltip.element}
        </>
    );
}

// A column per group, growing from one baseline, its number on top; the
// group's name and range under it
//   bars: [{ key, label, hint, value, muted }]
function Columns({ bars, total }) {
    const tooltip = useTooltip();
    const most = Math.max(1, ...bars.map((b) => b.value));
    return (
        <>
            <div className="Stats-columns">
                {bars.map((b) => (
                    <div key={b.key} className="Stats-column">
                        {/* its number, and its share of them all */}
                        <span className="Stats-columnValue">
                            {b.value}
                            {/* (a few, but under 1%: "<1%", not "0%") */}
                            <span className="Stats-columnShare">
                                {b.value > 0 && percent(b.value, total) === 0 ? "<1" : percent(b.value, total)}%
                            </span>
                        </span>
                        <span className="Stats-columnTrack">
                            <span
                                className={`Stats-columnBar${b.muted ? " is-muted" : ""}${b.value ? "" : " is-empty"}`}
                                style={{ height: `${(b.value / most) * 100}%` }}
                                {...tooltip.markProps(`${monkeysWord(b.value)} (${percent(b.value, total)}%)`, `${b.label} (${b.hint})`)}
                            />
                        </span>
                        <span className="Stats-columnLabel">
                            {b.label}
                            <span className="Stats-muted">{b.hint}</span>
                        </span>
                    </div>
                ))}
            </div>
            {tooltip.element}
        </>
    );
}

// A bar per row, its length its share of the biggest; the number at its
// tip. Rows with onPick are buttons (e.g. an enclosure: tap for its stats);
// a row with no value (null) has no bar, just why (missing).
//   rows: [{ key, label, value, text (the number as shown), tip, onPick,
//   pickLabel, missing, className (the bar's own colour), parts (the bar
//   split: [{ key, value }], coloured by key) }]
function BarList({ rows }) {
    const tooltip = useTooltip();
    const most = Math.max(1, ...rows.map((r) => r.value ?? 0));
    return (
        <>
            <ol className="Stats-ranked">
                {rows.map((r) => {
                    const inner = (
                        <>
                            <span className="Stats-rankedName">{r.label}</span>
                            {r.value === null ? (
                                <span className="Stats-rankedMissing">{r.missing}</span>
                            ) : (
                                <span className="Stats-rankedTrack">
                                    {r.value > 0 &&
                                        (r.parts ? (
                                            // (split into its parts: troop, introcages…)
                                            <span className="Stats-rankedBar is-split" style={{ "--share": r.value / most }}>
                                                {r.parts
                                                    .filter((p) => p.value > 0)
                                                    .map((p) => (
                                                        <span key={p.key} className={`Stats-part is-${p.key}`} style={{ flexGrow: p.value }} />
                                                    ))}
                                            </span>
                                        ) : (
                                            <span className={`Stats-rankedBar ${r.className ?? ""}`} style={{ "--share": r.value / most }} />
                                        ))}
                                    <span className="Stats-rankedValue">{r.text ?? r.value}</span>
                                </span>
                            )}
                        </>
                    );
                    const tip = r.value === null ? {} : tooltip.markProps(r.tip, r.label);
                    return (
                        <li key={r.key}>
                            {r.onPick ? (
                                <button
                                    type="button"
                                    className="Stats-rankedRow is-button"
                                    onClick={r.onPick}
                                    {...tip}
                                    aria-label={r.pickLabel}
                                >
                                    {inner}
                                </button>
                            ) : (
                                <div className="Stats-rankedRow" {...tip}>
                                    {inner}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>
            {tooltip.element}
        </>
    );
}

// Each troop's female / male split: a row each with its split bar and %
// female; tap one for its stats
//   rows: sexByTroop's; onPick(enclosure)
function SexList({ rows, onPick }) {
    const tooltip = useTooltip();
    return (
        <>
            <ol className="Stats-ranked">
                {rows.map((r) => {
                    const name = fullName(r.enclosure.name);
                    const words = `${r.femaleShare}% female, ${percent(r.male, r.total)}% male (${monkeysWord(r.total)})`;
                    return (
                        <li key={r.enclosure.id}>
                            <button
                                type="button"
                                className="Stats-rankedRow is-button"
                                onClick={() => onPick(r.enclosure)}
                                {...tooltip.markProps(words, name)}
                                aria-label={`${name}: ${words}. Show its stats`}
                            >
                                <span className="Stats-rankedName">{name}</span>
                                <span className="Stats-rankedTrack">
                                    <span className="Stats-parts is-small" aria-hidden="true">
                                        {[
                                            ["female", r.female],
                                            ["male", r.male],
                                            ["unknown", r.unknown],
                                        ]
                                            .filter(([, n]) => n > 0)
                                            .map(([key, n]) => (
                                                <span key={key} className={`Stats-part is-${key}`} style={{ flexGrow: n }} />
                                            ))}
                                    </span>
                                    <span className="Stats-rankedValue">{r.femaleShare}%</span>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ol>
            {tooltip.element}
        </>
    );
}

// "24 Oct"
const shortDay = (date) => {
    const [, m, d] = date.split("-").map(Number);
    return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
};

// A change: "+18 ml", "−5 ml", "±0 ml"
const changeText = (n, unit) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toLocaleString("en-GB")} ${unit}`;

// Clean steps for an axis: 0 to a round number above the highest, in 4
function niceTicks(most) {
    const raw = Math.max(1, most) / 4;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((n) => n * power).find((n) => n >= raw);
    return [0, 1, 2, 3, 4].map((i) => i * step);
}

// A line over time (one series): a 2px line with a faint wash under it, a
// dot per point, the last value labelled at the end; a crosshair finds the
// nearest point under the pointer (or arrow keys, once focused)
//   points: [{ x: "2026-10-24", y }] oldest first; unit: "ml", "g"
//   xLabel(x): how a point's date reads ("24 Oct", "Week of 19 Oct")
function LineChart({ points, unit, xLabel = shortDay, label }) {
    const boxRef = useRef(null);
    const [width, setWidth] = useState(600);
    const [active, setActive] = useState(null); // a point's index
    useEffect(() => {
        const box = boxRef.current;
        if (!box || typeof ResizeObserver === "undefined") return undefined;
        const watch = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
        watch.observe(box);
        return () => watch.disconnect();
    }, []);
    const height = 200;
    // Each point labelled with its value and the change since the one before
    // (when they fit: up to 14, with room between them); otherwise just the
    // latest, at the end of the line
    const labelAll = points.length <= 14 && (width - 100) / Math.max(1, points.length - 1) >= 46;
    const pad = { left: 44, right: labelAll ? 34 : 56, top: labelAll ? 40 : 14, bottom: 26 };
    const ticks = niceTicks(Math.max(...points.map((p) => p.y)));
    const top = ticks.at(-1);
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const xAt = (i) => pad.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const yAt = (y) => pad.top + plotH - (y / top) * plotH;
    const line = points.map((p, i) => `${i ? "L" : "M"}${xAt(i)},${yAt(p.y)}`).join(" ");
    const area = `${line} L${xAt(points.length - 1)},${yAt(0)} L${xAt(0)},${yAt(0)} Z`;
    // The labelled dates: every one (while every point's labelled), or
    // else the first, the last, and one between
    const labelled = labelAll
        ? points.map((_, i) => i)
        : [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    const last = points.at(-1);
    const showDots = points.length <= 40;

    function nearest(event) {
        const box = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - box.left) / box.width) * width;
        let best = 0;
        points.forEach((_, i) => {
            if (Math.abs(xAt(i) - x) < Math.abs(xAt(best) - x)) best = i;
        });
        setActive(best);
    }
    function onKeyDown(event) {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        setActive((i) => Math.min(points.length - 1, Math.max(0, (i ?? points.length - 1) + step)));
    }
    const point = active === null ? null : points[active];

    return (
        <div className="Stats-line" ref={boxRef}>
            <svg
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label={`${label}: ${points.length} ${points.length === 1 ? "point" : "points"}, the latest ${last.y.toLocaleString("en-GB")} ${unit} (${xLabel(last.x)}). Use the arrow keys to step through them.`}
                tabIndex={0}
                onPointerMove={nearest}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(points.length - 1)}
                onBlur={() => setActive(null)}
                onKeyDown={onKeyDown}
            >
                {/* The grid: hairlines at clean steps */}
                {ticks.map((t) => (
                    <g key={t}>
                        <line className="Stats-gridline" x1={pad.left} x2={width - pad.right} y1={yAt(t)} y2={yAt(t)} />
                        <text className="Stats-axis" x={pad.left - 8} y={yAt(t)} textAnchor="end" dominantBaseline="middle">
                            {t >= 1000 ? `${t / 1000}k` : t}
                        </text>
                    </g>
                ))}
                {labelled.map((i) => (
                    <text key={i} className="Stats-axis" x={xAt(i)} y={height - 6} textAnchor="middle">
                        {xLabel(points[i].x)}
                    </text>
                ))}
                <path className="Stats-lineArea" d={area} />
                <path className="Stats-linePath" d={line} />
                {showDots &&
                    points.map((p, i) => <circle key={p.x} className="Stats-lineDot" cx={xAt(i)} cy={yAt(p.y)} r={4} />)}
                {labelAll ? (
                    // Every point: its value, and the change since the one before
                    points.map((p, i) => (
                        <g key={p.x}>
                            {i > 0 && (
                                <text className="Stats-lineChange" x={xAt(i)} y={yAt(p.y) - 26} textAnchor="middle">
                                    {changeText(p.y - points[i - 1].y, unit)}
                                </text>
                            )}
                            <text className="Stats-lineValue" x={xAt(i)} y={yAt(p.y) - 11} textAnchor="middle">
                                {p.y.toLocaleString("en-GB")} {unit}
                            </text>
                        </g>
                    ))
                ) : (
                    // The latest value, at the end of the line
                    <text className="Stats-lineEnd" x={xAt(points.length - 1) + 10} y={yAt(last.y)} dominantBaseline="middle">
                        {last.y.toLocaleString("en-GB")} {unit}
                    </text>
                )}
                {/* The crosshair: where the pointer (or arrow keys) is */}
                {point && (
                    <g>
                        <line className="Stats-crosshair" x1={xAt(active)} x2={xAt(active)} y1={pad.top} y2={yAt(0)} />
                        <circle className="Stats-lineDot is-active" cx={xAt(active)} cy={yAt(point.y)} r={5} />
                    </g>
                )}
            </svg>
            {point && (
                <div
                    className="Stats-tooltip is-inChart"
                    role="status"
                    style={{ left: `${(xAt(active) / width) * 100}%`, top: yAt(point.y) }}
                >
                    <strong>
                        {point.y.toLocaleString("en-GB")} {unit}
                    </strong>
                    <span>{xLabel(point.x)}</span>
                    {active > 0 && (
                        <span>{changeText(point.y - points[active - 1].y, unit)} since the one before</span>
                    )}
                    {/* (that day's notes) */}
                    {point.notes?.map((note) => (
                        <span key={note} className="Stats-tooltipNote">
                            {note}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// The number tiles across the top
function Tiles({ stats }) {
    const tiles = [
        { label: "Monkeys", value: stats.total },
        // (female / male: the card below)
        { label: "Babies", value: stats.ages.babies, sub: "under 1 year old" },
        { label: "Golden Oldies", value: stats.ages.goldenOldies, sub: "20+ years old" },
        {
            label: "Average age",
            value: stats.averageAge === null ? "–" : stats.averageAge,
            sub: stats.averageAge === null ? "no ages known" : "years old",
        },
    ];
    return (
        <dl className="Stats-tiles">
            {tiles.map((t) => (
                <div key={t.label}>
                    <dt>{t.label}</dt>
                    <dd>
                        {t.value}
                        {t.sub && <span className="Stats-tileSub">{t.sub}</span>}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

const NO_BABY_RECORDS = { feeds: [], weights: [] };

// Baby Care's own stats (not sections, introcages or age groups): its
// babies, female to male, the youngest and oldest; milk drunk per day and
// weight per week, for all the babies or one
//   babies: the monkeys in Baby Care
//   records: { feeds: [{ monkeyId, date, ml }], weights: [{ monkeyId,
//   date, grams }] } (empty until they're recorded)
function BabyCareStats({ babies, records: given }) {
    const [babyId, setBabyId] = useState("");
    // The records: given (tests), or loaded from the database (milk totals,
    // milk-totals.sql; weights: not recorded yet)
    const [loaded, setLoaded] = useState(NO_BABY_RECORDS);
    useEffect(() => {
        if (given) return undefined;
        let cancelled = false;
        loadMilkTotals()
            .then((feeds) => !cancelled && setLoaded({ ...NO_BABY_RECORDS, feeds }))
            .catch(() => {
                // (not there yet, or offline: the charts say so)
            });
        return () => {
            cancelled = true;
        };
    }, [given]);
    const records = given ?? loaded;
    const chosen = babies.find((m) => String(m.id) === babyId) ?? null;
    const { youngest, oldest } = youngestOldest(babies);
    const sex = statsFor(babies).sex;
    const baby = (m) =>
        m
            ? { value: m.name, sub: babyAgeText(m.birthDate) }
            : { value: "–", sub: babies.length ? "birth dates not recorded" : "no babies" };
    const tiles = [
        { label: "Babies", value: babies.length },
        {
            label: "Female : male",
            value: `${sex.female} : ${sex.male}`,
            sub: sex.unknown ? `${sex.unknown} not known` : null,
        },
        { label: "Youngest baby", ...baby(youngest) },
        { label: "Oldest baby", ...baby(oldest) },
    ];
    const id = chosen ? chosen.id : null;
    const milk = milkPerDay(records.feeds, id);
    const weights = weightPerWeek(records.weights, id);
    const whose = chosen ? chosen.name : "All babies";
    const weekLabel = (x) => `w/c ${shortDay(x)}`;
    return (
        <>
            <dl className="Stats-tiles">
                {tiles.map((t) => (
                    <div key={t.label}>
                        <dt>{t.label}</dt>
                        <dd>
                            {t.value}
                            {t.sub && <span className="Stats-tileSub">{t.sub}</span>}
                        </dd>
                    </div>
                ))}
            </dl>

            {/* Whose milk and weight: all the babies, or one */}
            {babies.length > 0 && (
                <div className="Stats-filters">
                    <label className="Stats-select">
                        <span className="visually-hidden">Show milk and weight for</span>
                        <select value={babyId} onChange={(e) => setBabyId(e.target.value)}>
                            <option value="">All babies</option>
                            {babies.map((m) => (
                                <option key={m.id ?? m.name} value={m.id}>
                                    {m.name}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            )}

            <div className="Stats-grid">
                <Card
                    title="Milk intake per day"
                    headline={chosen ? `${whose}'s milk, in ml a day` : "All the babies' milk together, in ml a day"}
                    wide
                    table={{ columns: ["Day", "Milk (ml)", "Notes"], rows: milk.map((p) => [shortDay(p.x), p.y, p.notes.join("; ")]) }}
                >
                    {milk.length ? (
                        <LineChart points={milk} unit="ml" label="Milk intake per day" />
                    ) : (
                        <p className="Stats-none">No milk records yet. They'll show here once they're being recorded.</p>
                    )}
                </Card>
                <Card
                    title="Weight per week"
                    headline={chosen ? `${whose}'s weight, in grams (the last weighing each week)` : "The babies' average weight, in grams (each one's last weighing that week)"}
                    wide
                    table={{ columns: ["Week", "Weight (g)"], rows: weights.map((p) => [weekLabel(p.x), p.y]) }}
                >
                    {weights.length ? (
                        <LineChart points={weights} unit="g" xLabel={weekLabel} label="Weight per week" />
                    ) : (
                        <p className="Stats-none">No weights recorded yet. They'll show here once they're being recorded.</p>
                    )}
                </Card>
            </div>
        </>
    );
}

// monkeys / enclosures / sections: the data (from ShowPage)
//   babyRecords: Baby Care's milk and weights (see BabyCareStats)
function StatisticsPage({ monkeys, enclosures, sections, babyRecords, inert = false }) {
    // Whose stats: an enclosure's id, "" for the whole sanctuary, or
    // "bandits" (the wild troop, on their own); and which part of it
    const [enclosureId, setEnclosureId] = useState("");
    const [part, setPart] = useState("all");
    // The ranked lists' order: highest first to start with (more space,
    // more females, more monkeys)
    const [highFirst, setHighFirst] = useState({ space: true, sex: true, places: true });
    const sortProps = (key) => ({
        highFirst: highFirst[key],
        onToggle: () => setHighFirst((h) => ({ ...h, [key]: !h[key] })),
    });
    const bandits = enclosureId === "bandits";
    const enclosure = enclosures.find((e) => String(e.id) === enclosureId) ?? null;
    // (only an enclosure with a troop and introcages has parts to choose)
    const hasParts =
        Boolean(enclosure) && hasTroop(enclosure) && enclosures.some((e) => isInside(e) && e.parentId === enclosure.id);
    const chosenPart = hasParts ? part : "all";
    const group = bandits ? banditMonkeys(monkeys) : monkeysIn(monkeys, enclosure, chosenPart);
    const stats = statsFor(group);
    // (the whole sanctuary) its sections
    const bySectionCounts = enclosure || bandits ? [] : countsBySection(monkeys, enclosures, sections);
    const places = enclosure || bandits ? [] : ranked(countsByEnclosure(monkeys, enclosures), (r) => r.count, highFirst.places);
    // Space per troop monkey: every troop enclosure (the whole sanctuary),
    // or this one's (a troop enclosure, its troop shown)
    const spaces = enclosure || bandits ? [] : ranked(spaceByEnclosure(monkeys, enclosures), (r) => r.perMonkey, highFirst.space);
    // Each troop's female / male split (the whole sanctuary)
    const troopSexes = enclosure || bandits ? [] : ranked(sexByTroop(monkeys, enclosures), (r) => r.femaleShare, highFirst.sex);
    const ownSpace = enclosure && hasTroop(enclosure) && chosenPart !== "introcages" ? spacePerMonkey(enclosure, monkeys) : null;
    const troopCount = enclosure ? monkeysIn(monkeys, enclosure, "troop").length : 0;
    // The AM plates (once the database has feeding): those monkeys' plates
    const am = !bandits && group.some(hasFeeding) ? amPlatesFor(group) : null;

    function choose(id) {
        setEnclosureId(id);
        setPart("all");
        window.scrollTo?.(0, 0);
    }

    const sexParts = [
        { key: "female", label: "Female", value: stats.sex.female },
        { key: "male", label: "Male", value: stats.sex.male },
        { key: "unknown", label: "Unknown", value: stats.sex.unknown },
    ];
    const ageBars = [
        ...STAT_AGE_GROUPS.map((g) => ({ key: g.id, label: g.label, hint: g.hint, value: stats.ages[g.id] })),
        { key: "unknown", label: "Unknown", hint: "age", value: stats.ages.unknown, muted: true },
    ];
    const homeParts = [
        { key: "troop", label: "Troop", value: stats.troop },
        { key: "introcages", label: enclosure && !hasTroop(enclosure) ? "Introcages / areas" : "Introcages", value: stats.introcages },
    ];
    const speciesRows = Object.entries(stats.species).sort((a, b) => b[1] - a[1]);
    const oldiesShare = percent(stats.ages.goldenOldies, stats.total);
    const juvenilesShare = percent(stats.ages.juveniles, stats.total);

    return (
        <div className="Stats" inert={inert}>
            <h1 className="Stats-title">Statistics</h1>

            {/* Whose stats: one row, above everything it changes */}
            <div className="Stats-filters">
                <label className="Stats-select">
                    <span className="visually-hidden">Show statistics for</span>
                    <select value={enclosureId} onChange={(e) => choose(e.target.value)}>
                        <option value="">Whole Sanctuary</option>
                        {/* (care units: just Baby Care, which has its own stats;
                            Quarantine and Sickbay: later) */}
                        {bySection(
                            enclosures.filter((e) => !isCareUnit(e) || e.name === BABY_CARE),
                            sections
                        ).map(({ section, enclosures: list }) => (
                            <optgroup key={section} label={section}>
                                {list.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {fullName(e.name)}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                        {/* (the wild troop: not in the sanctuary's figures) */}
                        {monkeys.some((m) => m.troop === BANDITS) && (
                            <optgroup label="Wild">
                                <option value="bandits">Bandits</option>
                            </optgroup>
                        )}
                    </select>
                </label>
                {hasParts && (
                    <div className="Stats-segments" role="group" aria-label="Which monkeys">
                        {PARTS.map((p) => (
                            <button key={p.id} type="button" aria-pressed={chosenPart === p.id} onClick={() => setPart(p.id)}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {enclosure?.name === BABY_CARE ? (
                // Baby Care: its own stats
                <BabyCareStats key={enclosure.id} babies={group} records={babyRecords} />
            ) : stats.total === 0 ? (
                <p className="Stats-none">No monkeys here at the moment.</p>
            ) : (
                <>
                    <Tiles stats={stats} />
                    <div className="Stats-grid">
                        <Card
                            title="Female and male"
                            headline={`${percent(stats.sex.female, stats.total)}% female, ${percent(stats.sex.male, stats.total)}% male`}
                            table={{
                                columns: ["Sex", "Monkeys", "%"],
                                rows: sexParts.map((p) => [p.label, p.value, `${percent(p.value, stats.total)}%`]),
                            }}
                        >
                            <PartsBar parts={sexParts} total={stats.total} />
                        </Card>

                        {chosenPart === "all" && !bandits && (
                            <Card
                                title="Troop and introcages"
                                headline={`${percent(stats.troop, stats.total)}% in a troop`}
                                table={{
                                    columns: ["Where", "Monkeys", "%"],
                                    rows: homeParts.map((p) => [p.label, p.value, `${percent(p.value, stats.total)}%`]),
                                }}
                            >
                                <PartsBar parts={homeParts} total={stats.total} />
                            </Card>
                        )}

                        <Card
                            title="Age groups"
                            headline={`${oldiesShare}% golden oldies (20+ years old), ${juvenilesShare}% juveniles (1–3 years old)`}
                            wide
                            table={{
                                columns: ["Age group", "Ages", "Monkeys", "%"],
                                rows: ageBars.map((b) => [b.label, b.hint, b.value, `${percent(b.value, stats.total)}%`]),
                            }}
                        >
                            <Columns bars={ageBars} total={stats.total} />
                        </Card>

                        {/* Species, and under it (the whole sanctuary) the
                            monkeys per section: stacked in one column, beside
                            the taller AM plates */}
                        {(speciesRows.length > 1 || bySectionCounts.length > 0) && (
                            <div className="Stats-stack">
                                {speciesRows.length > 1 && (
                                    <Card
                                        title="Species"
                                        table={{
                                            columns: ["Species", "Monkeys", "%"],
                                            rows: speciesRows.map(([key, n]) => [SPECIES[key] ?? key, n, `${percent(n, stats.total)}%`]),
                                        }}
                                    >
                                        <dl className="Stats-list">
                                            {speciesRows.map(([key, n]) => (
                                                <div key={key}>
                                                    <dt>{SPECIES[key] ?? key}</dt>
                                                    <dd>
                                                        {n} <span className="Stats-muted">({percent(n, stats.total)}%)</span>
                                                    </dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </Card>
                                )}

                                {bySectionCounts.length > 0 && (
                                    <Card
                                        title="Monkeys per section"
                                        table={{
                                            columns: ["Section", "Monkeys", "%"],
                                            rows: bySectionCounts.map(({ section, count }) => [sectionLabel(section), count, `${percent(count, stats.total)}%`]),
                                        }}
                                    >
                                        {/* (a colour each: see the CSS) */}
                                        <BarList
                                            rows={bySectionCounts.map(({ section, count }) => ({
                                                key: section,
                                                label: sectionLabel(section),
                                                value: count,
                                                tip: `${monkeysWord(count)} (${percent(count, stats.total)}%)`,
                                                className: `is-section-${section.toLowerCase().replace(/\s+/g, "-")}`,
                                            }))}
                                        />
                                    </Card>
                                )}
                            </div>
                        )}

                        {/* Space: a troop enclosure's own (every troop
                            enclosure's: its own card, further down) */}
                        {enclosure && hasTroop(enclosure) && chosenPart !== "introcages" && (
                            <Card
                                title="Space per monkey"
                                table={{
                                    columns: ["Enclosure", "Size", "Troop monkeys", "Space per monkey"],
                                    rows: [[fullName(enclosure.name), sizeText(enclosure.size) ?? "Not recorded", troopCount, ownSpace === null ? "–" : `${ownSpace} m²`]],
                                }}
                            >
                                {ownSpace === null ? (
                                    <p className="Stats-none">The enclosure's size isn't recorded yet.</p>
                                ) : (
                                    <p className="Stats-hero">
                                        {ownSpace.toLocaleString("en-GB")} m²
                                        <span className="Stats-heroSub">
                                            each, for the {troopCount} troop {troopCount === 1 ? "monkey" : "monkeys"} in{" "}
                                            <span className="Stats-nowrap">{sizeText(enclosure.size)}</span>
                                        </span>
                                    </p>
                                )}
                            </Card>
                        )}

                        {am && (
                            <Card
                                title="AM plates"
                                table={{
                                    columns: ["AM plates", "Monkeys"],
                                    rows: [
                                        ["Fed by Mainfeed", am.localTeam],
                                        ["Fed by Sickbay", am.sickbay],
                                        ["Normal", am.normal],
                                        ["Cut small", am.cutSmall],
                                        ["Cut small + fruit", am.cutSmallFruit],
                                        ["Add fruit", am.fruit],
                                        ["Metal plate", am.metal],
                                    ],
                                }}
                            >
                                {/* Who feeds them: two numbers */}
                                <dl className="Stats-pair">
                                    <div>
                                        <dt>Fed by Mainfeed</dt>
                                        <dd>{am.localTeam}</dd>
                                    </div>
                                    <div>
                                        <dt>Fed by Sickbay</dt>
                                        <dd>{am.sickbay}</dd>
                                    </div>
                                </dl>
                                {/* Mainfeed's monkeys (the Local Team's, elsewhere in
                                    the app, for now), by their plate */}
                                <BarList
                                    rows={[
                                        ["normal", "Normal", am.normal],
                                        ["cutSmall", "Cut small", am.cutSmall],
                                        ["cutSmallFruit", "Cut small + fruit", am.cutSmallFruit],
                                        ["fruit", "Add fruit", am.fruit],
                                        ["metal", "Metal plate", am.metal],
                                    ].map(([key, label, n]) => ({
                                        key,
                                        label,
                                        value: n,
                                        tip: `${monkeysWord(n)} (${percent(n, am.localTeam)}% of Mainfeed's)`,
                                    }))}
                                />
                            </Card>
                        )}

                        {spaces.length > 0 && (
                            <Card
                                title="Space per monkey"
                                headline="Each troop monkey's share of its troop enclosure. Tap one for its stats."
                                wide
                                sort={sortProps("space")}
                                table={{
                                    columns: ["Enclosure", "Size", "Troop monkeys", "Space per monkey"],
                                    rows: spaces.map(({ enclosure: e, troop, perMonkey }) => [
                                        fullName(e.name),
                                        sizeText(e.size) ?? "Not recorded",
                                        troop,
                                        perMonkey === null ? "–" : `${perMonkey} m²`,
                                    ]),
                                }}
                            >
                                <BarList
                                    rows={spaces.map(({ enclosure: e, troop, perMonkey }) => ({
                                        key: e.id,
                                        label: fullName(e.name),
                                        value: perMonkey,
                                        text: perMonkey === null ? null : `${perMonkey.toLocaleString("en-GB")} m²`,
                                        tip: `${perMonkey} m² each (${monkeysWord(troop)} in ${sizeText(e.size)})`,
                                        missing: "Size not recorded",
                                        onPick: () => choose(String(e.id)),
                                        pickLabel: `${fullName(e.name)}: ${perMonkey === null ? "size not recorded" : `${perMonkey} m² per monkey`}. Show its stats`,
                                    }))}
                                />
                            </Card>
                        )}

                        {troopSexes.length > 0 && (
                            <Card
                                title="Female-to-male by troop"
                                headline="Percentage of females to males in each troop enclosure"
                                wide
                                sort={sortProps("sex")}
                                table={{
                                    columns: ["Troop", "Female", "Male", "Unknown", "% female"],
                                    rows: troopSexes.map((r) => [fullName(r.enclosure.name), r.female, r.male, r.unknown, `${r.femaleShare}%`]),
                                }}
                            >
                                <SexList rows={troopSexes} onPick={(e) => choose(String(e.id))} />
                                <ul className="Stats-legend">
                                    {[
                                        ["female", "Female"],
                                        ["male", "Male"],
                                        ["unknown", "Unknown"],
                                    ].map(([key, label]) => (
                                        <li key={key}>
                                            <span className={`Stats-swatch is-${key}`} aria-hidden="true" />
                                            <span className="Stats-legendLabel">{label}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        )}

                        {places.length > 0 && (
                            <Card
                                title="Monkeys per enclosure"
                                headline={`${places.length} enclosures and care units. Tap one for its stats.`}
                                wide
                                sort={sortProps("places")}
                                table={{
                                    columns: ["Enclosure", "Troop", "Introcages", "Monkeys", "%"],
                                    rows: places.map(({ enclosure: e, count, troop, introcages }) => [
                                        fullName(e.name),
                                        troop,
                                        introcages,
                                        count,
                                        `${percent(count, stats.total)}%`,
                                    ]),
                                }}
                            >
                                <BarList
                                    rows={places.map(({ enclosure: e, count, troop, introcages }) => ({
                                        key: e.id,
                                        label: fullName(e.name),
                                        value: count,
                                        // (troop, then introcages / areas)
                                        parts: [
                                            { key: "troop", value: troop },
                                            { key: "introcages", value: introcages },
                                        ],
                                        tip: `${monkeysWord(count)}: ${troop} troop, ${introcages} ${hasTroop(e) ? "introcage" : "introcage / area"}`,
                                        onPick: () => choose(String(e.id)),
                                        pickLabel: `${fullName(e.name)}: ${monkeysWord(count)}, ${troop} in the troop and ${introcages} in introcages. Show its stats`,
                                    }))}
                                />
                                <ul className="Stats-legend">
                                    {[
                                        ["troop", "Troop"],
                                        ["introcages", "Introcages / areas"],
                                    ].map(([key, label]) => (
                                        <li key={key}>
                                            <span className={`Stats-swatch is-${key}`} aria-hidden="true" />
                                            <span className="Stats-legendLabel">{label}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        )}
                    </div>
                    <p className="Stats-note">
                        {bandits
                            ? "Figures for the Bandits, the wild troop (not in the sanctuary's figures)."
                            : `Figures for ${enclosure ? fullName(enclosure.name) : "the sanctuary"}, by where each monkey lives (a monkey in Sickbay or staying in an introcage counts at home). Not counting the Bandits.`}
                    </p>
                </>
            )}
        </div>
    );
}

export default StatisticsPage;
