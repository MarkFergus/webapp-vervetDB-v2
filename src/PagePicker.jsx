import { IconChevronRight } from "@tabler/icons-react";
import "./RecordsPage.css";

// A page of choices, like the Records page's (pick a team, then a task) and
// the Admin Dashboard's: the way back above the title, then a list of big
// rows. (Their look: RecordsPage.css)

// "Records › Baby Care" above the title: every step but the last
//   crumbs: [{ href, label }], the last one the page itself
export function Crumbs({ crumbs }) {
    if (crumbs.length < 2) return null;
    return (
        <nav className="RecordsPage-crumbs" aria-label="Breadcrumb">
            {crumbs.slice(0, -1).map((c) => (
                <span key={c.href}>
                    <a href={c.href}>{c.label}</a>
                    <IconChevronRight size={14} aria-hidden="true" />
                </span>
            ))}
        </nav>
    );
}

// One of the big rows: an icon, the title and a line under it
export function Choice({ href, Icon, title, sub }) {
    return (
        <li>
            <a className="RecordsPage-choice" href={href}>
                <span className="RecordsPage-choiceIcon">
                    <Icon size={24} stroke={1.75} aria-hidden="true" />
                </span>
                <span className="RecordsPage-choiceText">
                    <span className="RecordsPage-choiceTitle">{title}</span>
                    {sub && <span className="RecordsPage-choiceSub">{sub}</span>}
                </span>
                <IconChevronRight size={20} aria-hidden="true" className="RecordsPage-choiceArrow" />
            </a>
        </li>
    );
}
