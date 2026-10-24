import { useId, useState } from "react";
import { IconChartBar, IconSortAscending, IconSortDescending, IconTable } from "@tabler/icons-react";
import { bySection, hasTroop, isInside, sizeText } from "./enclosures";
import { fullName } from "./places";
import { SPECIES } from "./species";
import { AGE_GROUPS } from "./ages";
import { hasFeeding } from "./feeding";
import {
    BANDITS,
    PARTS,
    amPlatesFor,
    banditMonkeys,
    countsByEnclosure,
    monkeysIn,
    percent,
    ranked,
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
                        <span className="Stats-columnValue">{b.value}</span>
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
//   pickLabel, missing }]
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
                                    {r.value > 0 && <span className="Stats-rankedBar" style={{ width: `${(r.value / most) * 100}%` }} />}
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

// The number tiles across the top
function Tiles({ stats }) {
    const tiles = [
        { label: "Monkeys", value: stats.total },
        { label: "Female", value: `${percent(stats.sex.female, stats.total)}%`, sub: monkeysWord(stats.sex.female) },
        { label: "Male", value: `${percent(stats.sex.male, stats.total)}%`, sub: monkeysWord(stats.sex.male) },
        {
            label: "Average age",
            value: stats.averageAge === null ? "–" : stats.averageAge,
            sub: stats.averageAge === null ? "no ages known" : "years",
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

// monkeys / enclosures / sections: the data (from ShowPage)
function StatisticsPage({ monkeys, enclosures, sections, inert = false }) {
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
        ...AGE_GROUPS.map((g) => ({ key: g.id, label: g.label, hint: g.hint, value: stats.ages[g.id] })),
        { key: "unknown", label: "Unknown", hint: "age", value: stats.ages.unknown, muted: true },
    ];
    const homeParts = [
        { key: "troop", label: "Troop", value: stats.troop },
        { key: "introcages", label: enclosure && !hasTroop(enclosure) ? "Introcages / areas" : "Introcages", value: stats.introcages },
    ];
    const speciesRows = Object.entries(stats.species).sort((a, b) => b[1] - a[1]);
    const elderlyShare = percent(stats.ages.elderly, stats.total);
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
                        {bySection(enclosures, sections).map(({ section, enclosures: list }) => (
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

            {stats.total === 0 ? (
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
                            headline={`${elderlyShare}% elderly (15+), ${juvenilesShare}% juveniles (1–3)`}
                            wide
                            table={{
                                columns: ["Age group", "Ages", "Monkeys", "%"],
                                rows: ageBars.map((b) => [b.label, b.hint, b.value, `${percent(b.value, stats.total)}%`]),
                            }}
                        >
                            <Columns bars={ageBars} total={stats.total} />
                        </Card>

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

                        {/* Space: a troop enclosure's own, or every troop
                            enclosure's (least space first) */}
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
                                            each, for the {troopCount} troop {troopCount === 1 ? "monkey" : "monkeys"} in {sizeText(enclosure.size)}
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
                                        ["Fed by the Local Team", am.localTeam],
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
                                        <dt>Fed by the Local Team</dt>
                                        <dd>{am.localTeam}</dd>
                                    </div>
                                    <div>
                                        <dt>Fed by Sickbay</dt>
                                        <dd>{am.sickbay}</dd>
                                    </div>
                                </dl>
                                {/* The Local Team's monkeys, by their plate */}
                                <h3 className="Stats-subhead">The Local Team's, by plate</h3>
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
                                        tip: `${monkeysWord(n)} (${percent(n, am.localTeam)}% of the Local Team's)`,
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
                                title="Female to male by troop"
                                headline="Each troop's split (not its introcages), by % female. Tap one for its stats."
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
                                title="Where they live"
                                headline={`${places.length} enclosures and care units. Tap one for its stats.`}
                                wide
                                sort={sortProps("places")}
                                table={{
                                    columns: ["Enclosure", "Monkeys", "%"],
                                    rows: places.map(({ enclosure: e, count }) => [fullName(e.name), count, `${percent(count, stats.total)}%`]),
                                }}
                            >
                                <BarList
                                    rows={places.map(({ enclosure: e, count }) => ({
                                        key: e.id,
                                        label: fullName(e.name),
                                        value: count,
                                        tip: `${monkeysWord(count)} (${percent(count, stats.total)}%)`,
                                        onPick: () => choose(String(e.id)),
                                        pickLabel: `${fullName(e.name)}: ${monkeysWord(count)}. Show its stats`,
                                    }))}
                                />
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
