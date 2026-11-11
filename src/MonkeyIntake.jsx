import { useEffect, useState } from "react";
import { IconFileSpreadsheet, IconFileTypePdf } from "@tabler/icons-react";
import { loadIntake } from "./monkeyData";
import { intakeFileName, intakeReport, intakeTitle, intakeYears, longDate } from "./intakeReport";
import { downloadBlob } from "./canvasHelpers";
import "./Modal.css"; // the buttons
import "./MonkeyIntake.css";

// Monkey Intake (Admin Dashboard, #admin/intake): a year's arrivals,
// releases, deaths, and escaped or missing monkeys, each in its own list
// (intakeReport.js), with the whole report to download as an Excel file or
// a PDF.

// The download libraries, loaded once the page opens, so a tap downloads
// straight away (some phones only allow a download just after a tap)
const loadPdf = () => Promise.all([import("@react-pdf/renderer"), import("./IntakePDF")]);
const loadExcel = () => import("./intakeExcel");

export function IntakeList({ list }) {
    return (
        <section className="Admin-card Intake-list" aria-label={list.title}>
            <h2>
                {list.title} <span className="Intake-count">{list.rows.length}</span>
            </h2>
            {list.rows.length ? (
                <div className="Intake-scroll">
                    <table className="Intake-table">
                        <thead>
                            <tr>
                                {list.columns.map((c) => (
                                    <th key={c.key} scope="col" className={`is-${c.key}`}>
                                        {c.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {list.rows.map((row) => (
                                <tr key={row.no}>
                                    {list.columns.map((c) => (
                                        <td key={c.key} className={`is-${c.key}`}>
                                            {/* (2 lines at most, then "…": the whole text on hover) */}
                                            <span className="Intake-clamp" title={row[c.key]}>
                                                {row[c.key]}
                                            </span>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="Admin-note">{list.none}</p>
            )}
        </section>
    );
}

export default function MonkeyIntake() {
    const years = intakeYears();
    const [year, setYear] = useState(years[0]);
    // null (loading), { lists } or { problem }
    const [state, setState] = useState(null);
    // "pdf" / "excel" while one's being made; a problem making it
    const [making, setMaking] = useState(null);
    const [downloadProblem, setDownloadProblem] = useState(null);

    useEffect(() => {
        let current = true;
        setState(null);
        loadIntake(year)
            .then(({ monkeys, notes }) => current && setState({ lists: intakeReport(monkeys, year, notes) }))
            .catch((error) => current && setState({ problem: error.message }));
        return () => {
            current = false;
        };
    }, [year]);

    // (ready before the first tap; a failure here shows when downloading)
    useEffect(() => {
        loadPdf().catch(() => {});
        loadExcel().catch(() => {});
    }, []);

    async function download(kind) {
        setMaking(kind);
        setDownloadProblem(null);
        const updated = longDate(new Date());
        try {
            if (kind === "pdf") {
                const [{ pdf }, { default: IntakePDF }] = await loadPdf();
                const blob = await pdf(<IntakePDF lists={state.lists} year={year} updated={updated} />).toBlob();
                downloadBlob(blob, intakeFileName(year, "pdf"));
            } else {
                const { intakeExcel } = await loadExcel();
                downloadBlob(await intakeExcel(state.lists, year, updated), intakeFileName(year, "xlsx"));
            }
        } catch (error) {
            console.error(error);
            setDownloadProblem("Couldn't make the file. Check your internet connection, then try again.");
        } finally {
            setMaking(null);
        }
    }

    const ready = Boolean(state?.lists) && !making;
    return (
        <>
            <div className="Intake-bar">
                <label className="Intake-year">
                    <span>Year</span>
                    <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                        {years.map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                </label>
                <button type="button" className="Modal-edit is-blue-outline" aria-label="Download Excel" disabled={!ready} onClick={() => download("excel")}>
                    <IconFileSpreadsheet size={16} aria-hidden="true" />
                    {making === "excel" ? "Making…" : "Excel"}
                </button>
                <button type="button" className="Modal-edit is-blue-outline" aria-label="Download PDF" disabled={!ready} onClick={() => download("pdf")}>
                    <IconFileTypePdf size={16} aria-hidden="true" />
                    {making === "pdf" ? "Making…" : "PDF"}
                </button>
            </div>
            {downloadProblem && (
                <p className="Admin-note is-error" role="alert">
                    {downloadProblem}
                </p>
            )}
            {state === null ? (
                <p className="Admin-note">Loading…</p>
            ) : state.problem ? (
                <p className="Admin-note is-error" role="alert">
                    {state.problem}
                </p>
            ) : (
                <div aria-label={intakeTitle(year)} role="region">
                    {state.lists.map((list) => (
                        <IntakeList key={list.id} list={list} />
                    ))}
                </div>
            )}
        </>
    );
}
