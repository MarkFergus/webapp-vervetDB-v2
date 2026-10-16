import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { CHANGELOG, releaseDate, seriesGroups } from "./changelog";
import { Release } from "./AboutModal";
import "./AboutModal.css";
import "./UpdatesPage.css";

// The Updates page (#updates, from About's "See All Updates"): every
// version of vervetDB, newest first, grouped by series (Version 1.12,
// Version 1.11 …). Each group opens on its own; the newest starts open.
function UpdatesPage({ inert = false }) {
    const groups = seriesGroups(CHANGELOG);
    const [open, setOpen] = useState(() => new Set([groups[0]?.series]));
    const toggle = (series) =>
        setOpen((shown) => {
            const next = new Set(shown);
            if (next.has(series)) next.delete(series);
            else next.add(series);
            return next;
        });

    return (
        <div className="UpdatesPage" inert={inert}>
            <h1 className="UpdatesPage-title">Updates</h1>
            <p className="UpdatesPage-intro">What's new in vervetDB, newest first.</p>
            {groups.map(({ series, releases }) => {
                const id = `UpdatesPage-${series.replace(".", "-")}`;
                const isOpen = open.has(series);
                return (
                    <section key={series} className="UpdatesPage-group">
                        <h2>
                            <button
                                type="button"
                                className="UpdatesPage-toggle"
                                aria-expanded={isOpen}
                                aria-controls={id}
                                onClick={() => toggle(series)}
                            >
                                {/* (spaces between, so it reads as words) */}
                                <span className="UpdatesPage-series">Version {series}</span>{" "}
                                {releases.some((r) => r.major) && <span className="AboutModal-major">Major Update</span>}{" "}
                                {/* (when the newest in the group came out) */}
                                <span className="UpdatesPage-date">{releaseDate(releases[0].date)}</span>
                                <IconChevronDown size={18} aria-hidden="true" />
                            </button>
                        </h2>
                        {isOpen && (
                            <div id={id} className="AboutModal-changes UpdatesPage-releases">
                                {releases.map((entry) => (
                                    <Release key={entry.version} entry={entry} showDate={releases.length > 1} />
                                ))}
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

export default UpdatesPage;
