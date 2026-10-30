import { useCallback, useEffect, useRef, useState } from "react";
import { IconArchive, IconCheck, IconHistory, IconMinus, IconUsers } from "@tabler/icons-react";
import { useAuth } from "./auth";
import { loadStaff, saveStaffRole, saveStatus } from "./monkeyData";
import { Choice, Crumbs } from "./PagePicker";
import { ArchiveList, useArchive } from "./MonkeyArchive";
import MonkeyPage from "./MonkeyPage";
import StaffActivity from "./StaffActivity";
import { ARCHIVE_ROUTE, STATUS_WORDS, archiveIdFromRoute } from "./monkeyStatus";
import "./ConfirmBubble.css";
import "./AdminPage.css";

// The Admin Dashboard (#admin, admins only: from the side rail / ☰ menu,
// under Add New Monkey): a choice of parts, like the Records page.
//   Staff Access (#admin/staff)     who can do what (each user type), and
//                                   every staff account, with its user type
//                                   to change. Nobody can be made an admin
//                                   here (Mark does that). (The database
//                                   checks both too: admin-dashboard.sql.)
//   Staff Activity (#admin/activity) what each staff member has added,
//                                   changed or deleted (StaffActivity.jsx;
//                                   looking only, for now)
//   Monkey Archive (#admin/archive) the monkeys no longer at the sanctuary
//                                   (MonkeyArchive.jsx); each one's Full
//                                   Profile (#admin/archive/<name>-<id>),
//                                   with Status Update to change its status
//                                   or restore it (monkey-archive.sql)

// The user types, in the table's order (visitors: not signed in)
export const USER_TYPES = [
    { id: "visitor", label: "Visitors", short: "Visit." },
    { id: "limited", label: "Limited", short: "Ltd." },
    { id: "maintenance", label: "Maintenance", short: "Maint." },
    { id: "editor", label: "Editors", short: "Editor" },
    { id: "admin", label: "Admins", short: "Admin" },
];

// The types an account can be given
export const ROLES = [
    { id: "admin", label: "Admin" },
    { id: "editor", label: "Editor" },
    { id: "maintenance", label: "Maintenance" },
    { id: "limited", label: "Limited" },
];

// Who can do what: each row, the user types that can
export const ACCESS = [
    { what: "Monkey cards, with Feeding", who: ["visitor", "limited", "maintenance", "editor", "admin"] },
    { what: "Statistics, Interactive Map and Monkey Guesser", who: ["visitor", "limited", "maintenance", "editor", "admin"] },
    { what: "Full Profile, Monitoring Notes, Injuries and Integration Reports", who: ["limited", "maintenance", "editor", "admin"] },
    { what: "Documents (PDFs)", who: ["limited", "maintenance", "editor", "admin"] },
    { what: "Log maintenance (and change their own)", who: ["maintenance", "editor", "admin"] },
    { what: "Edit monkey cards (Bio, features, Feeding, Monitoring) and Quick Actions", who: ["editor", "admin"] },
    { what: "Add Photos", who: ["editor", "admin"] },
    { what: "Add records: injuries, reports, arrival info (and change their own)", who: ["editor", "admin"] },
    { what: "Edit Full Profiles (every detail)", who: ["admin"] },
    { what: "Add and delete monkeys", who: ["admin"] },
    { what: "Enclosure details and troops", who: ["admin"] },
    { what: "Change or delete anyone's records", who: ["admin"] },
    { what: "Status Update and the Monkey Archive", who: ["admin"] },
    { what: "Admin Dashboard: user types and Staff Activity", who: ["admin"] },
];

function AccessTable() {
    return (
        <table className="Admin-access">
            <thead>
                <tr>
                    <th scope="col">
                        <span className="Admin-visuallyHidden">What</span>
                    </th>
                    {USER_TYPES.map((type) => (
                        <th key={type.id} scope="col">
                            <abbr title={type.label} className="Admin-short">{type.short}</abbr>
                            <span className="Admin-long">{type.label}</span>
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {ACCESS.map((row) => (
                    <tr key={row.what}>
                        <th scope="row">{row.what}</th>
                        {USER_TYPES.map((type) => (
                            <td key={type.id}>
                                {row.who.includes(type.id) ? (
                                    <IconCheck className="Admin-yes" size={18} stroke={2.5} aria-label="Yes" />
                                ) : (
                                    <IconMinus className="Admin-no" size={16} aria-label="No" />
                                )}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export const NO_ADMIN_UPGRADE = "Upgrading to admin is disabled, please request access changes to Mark";

// A small bubble above the user type (ConfirmBubble's look) saying making
// an admin is off; OK, Escape or a tap anywhere else puts it away
function NoAdminBubble({ onClose }) {
    const ref = useRef(null);
    const okRef = useRef(null);
    useEffect(() => {
        okRef.current?.focus();
        const handlePointerDown = (event) => !ref.current?.contains(event.target) && onClose();
        const handleKeyDown = (event) => event.key === "Escape" && onClose();
        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);
    return (
        <span className="ConfirmBubble Admin-bubble" role="alertdialog" aria-label={NO_ADMIN_UPGRADE} ref={ref}>
            <span className="ConfirmBubble-question">{NO_ADMIN_UPGRADE}</span>
            <span className="ConfirmBubble-buttons">
                <button type="button" className="Modal-edit is-quiet" onClick={onClose} ref={okRef}>
                    OK
                </button>
            </span>
        </span>
    );
}

function StaffList() {
    const { user } = useAuth();
    // null: loading; "failed": couldn't load
    const [staff, setStaff] = useState(null);
    // userId → "saving" or an error message
    const [status, setStatus] = useState({});
    // whose user type has the "no admins" bubble showing
    const [noAdminFor, setNoAdminFor] = useState(null);

    useEffect(() => {
        let cancelled = false;
        loadStaff()
            .then((list) => !cancelled && setStaff(list))
            .catch((error) => {
                console.error("Loading the staff list failed:", error);
                if (!cancelled) setStaff("failed");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const changeRole = async (person, role) => {
        // (making an admin is off: the bubble, and it stays as it was)
        if (role === "admin") {
            setNoAdminFor(person.userId);
            return;
        }
        setStatus((s) => ({ ...s, [person.userId]: "saving" }));
        try {
            await saveStaffRole(person.userId, role);
            setStaff((list) => list.map((p) => (p.userId === person.userId ? { ...p, role } : p)));
            setStatus((s) => ({ ...s, [person.userId]: undefined }));
        } catch (error) {
            setStatus((s) => ({ ...s, [person.userId]: error.message }));
        }
    };

    const closeNoAdmin = useCallback(() => setNoAdminFor(null), []);

    if (staff === null) return <p className="Admin-note">Loading staff…</p>;
    if (staff === "failed") {
        return <p className="Admin-note is-error">Couldn't load the staff list. Please check your connection and try again.</p>;
    }
    return (
        <>
            <p className="Admin-count">{staff.length === 1 ? "1 account" : `${staff.length} accounts`}</p>
            <ul className="Admin-staff">
                {staff.map((person) => {
                    const isMe = person.userId === user?.id;
                    const state = status[person.userId];
                    const name = person.name ?? person.email.split("@")[0];
                    return (
                        <li key={person.userId} className="Admin-person">
                            <div className="Admin-who">
                                <span className="Admin-name">
                                    {name}
                                    {isMe && <span className="Admin-you"> (you)</span>}
                                </span>
                                <span className="Admin-email">{person.email}</span>
                                {state && state !== "saving" && <span className="Admin-error" role="alert">{state}</span>}
                            </div>
                            <span className="Admin-roleWrap">
                            {noAdminFor === person.userId && <NoAdminBubble onClose={closeNoAdmin} />}
                            <select
                                className="Admin-role"
                                value={person.role ?? ""}
                                onChange={(event) => changeRole(person, event.target.value)}
                                // (your own can't be changed: no locking yourself out)
                                disabled={isMe || state === "saving"}
                                aria-label={`User type for ${name}`}
                                title={isMe ? "You can't change your own user type" : undefined}
                            >
                                {!person.role && (
                                    <option value="" disabled>
                                        No access
                                    </option>
                                )}
                                {ROLES.map((role) => (
                                    <option key={role.id} value={role.id}>
                                        {role.label}
                                    </option>
                                ))}
                            </select>
                            </span>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}

const PARTS = [
    { id: "staff", title: "Staff Access", sub: "What each user type can do, and every account's user type", Icon: IconUsers },
    { id: "activity", title: "Staff Activity", sub: "What each staff member has added, changed or deleted", Icon: IconHistory },
    { id: "archive", title: "Monkey Archive", sub: "Monkeys no longer at the sanctuary: deceased, escaped, missing and released", Icon: IconArchive },
];

// "admin" → no part (the choices); "admin/staff"; "admin/archive" and an
// archived monkey's page ("admin/archive/poppy-12": its id)
function parseAdminRoute(route) {
    const [, partId] = route.split("/");
    return { part: PARTS.find((p) => p.id === partId) ?? null, archiveId: archiveIdFromRoute(route) };
}

function StaffAccess() {
    return (
        <>
            <section className="Admin-card" aria-labelledby="Admin-accessTitle">
                <h2 id="Admin-accessTitle">Access</h2>
                <p className="Admin-note">
                    What each user type can do. Visitors are anyone not signed in. Limited accounts see everything staff see
                    but can't change anything.
                </p>
                <AccessTable />
            </section>
            <section className="Admin-card" aria-labelledby="Admin-staffTitle">
                <h2 id="Admin-staffTitle">Staff</h2>
                <StaffList />
            </section>
        </>
    );
}

// An archived monkey's Full Profile, with Status Update: any other status,
// or back to the sanctuary (then it's in the list again: onRestored)
function ArchivedMonkey({ archive, id, staff, onRestored, inert }) {
    const back = { href: `#${ARCHIVE_ROUTE}`, label: "Monkey Archive" };
    if (archive.list === null) return <p className="Admin-note">Loading…</p>;
    const monkey = Array.isArray(archive.list) ? (archive.list.find((m) => m.id === id) ?? null) : null;
    const choices = monkey ? Object.keys(STATUS_WORDS).filter((s) => s !== monkey.status) : [];
    return (
        <MonkeyPage
            // (a new status: its page again, with its new Status record)
            key={monkey ? `${monkey.id}-${monkey.status}-${monkey.statusChanges?.length ?? 0}` : "none"}
            monkey={monkey}
            staff={staff}
            back={back}
            inert={inert}
            statusChoices={choices}
            onStatusUpdate={async (m, values) => {
                const restored = await saveStatus(m.id, values);
                await archive.reload();
                if (restored) onRestored?.(restored);
            }}
        />
    );
}

// route: "admin", "admin/staff", "admin/archive"…
// staff: as MonkeyPage's (for an archived monkey's records)
// onRestored(monkey): one restored to the sanctuary
function AdminPage({ route = "admin", staff = null, onRestored, inert = false }) {
    const { part, archiveId } = parseAdminRoute(route);
    const archive = useArchive(part?.id === "archive");
    // An archived monkey's page: its Full Profile, as for any monkey
    if (archiveId !== null) {
        return <ArchivedMonkey archive={archive} id={archiveId} staff={staff} onRestored={onRestored} inert={inert} />;
    }
    const crumbs = [{ href: "#admin", label: "Admin Dashboard" }, ...(part ? [{ label: part.title }] : [])];
    return (
        <div className="Admin" inert={inert}>
            <Crumbs crumbs={crumbs} />
            <h1 className="Admin-title">{crumbs.at(-1).label}</h1>
            {!part ? (
                <>
                    <p className="Admin-intro">For admins only.</p>
                    <ul className="RecordsPage-choices">
                        {PARTS.map((p) => (
                            <Choice key={p.id} href={`#admin/${p.id}`} Icon={p.Icon} title={p.title} sub={p.sub} />
                        ))}
                    </ul>
                </>
            ) : part.id === "staff" ? (
                <>
                    <p className="Admin-intro">For admins only.</p>
                    <StaffAccess />
                </>
            ) : part.id === "activity" ? (
                <StaffActivity />
            ) : (
                <>
                    <p className="Admin-intro">Monkeys no longer at the sanctuary. Their records stay on file.</p>
                    <section className="Admin-card" aria-label="Monkey Archive">
                        <ArchiveList list={archive.list} />
                    </section>
                </>
            )}
        </div>
    );
}

export default AdminPage;
