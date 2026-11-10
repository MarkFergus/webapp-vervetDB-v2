// The Kindle dashboard's Alerts page (scripts/morningBriefServer.js): the
// Morning Brief's To Do, and every item in red from the rest
import { kindleAlerts } from "../scripts/morningBriefServer";

test("To Do in full, then only what's in red, each under its heading; Good To Know left out", () => {
    const brief = {
        sections: [
            { id: "to_do", title: "To Do", groups: [{ title: "Check On", lines: [{ text: "Malawi (Gismo): not seen", toDo: true }] }] },
            {
                id: "maintenance",
                title: "Maintenance",
                groups: [{ title: "New", lines: [{ text: "Urgent: Dreamland: fence", alert: true }, { text: "Mainfeed: tap" }] }],
            },
            { id: "baby_care", title: "Baby Care", groups: [{ title: "Milk", lines: [{ text: "Pip: 340 ml" }] }] },
            { id: "good_to_know", title: "Good To Know", groups: [{ title: "Arrived", lines: [{ text: "Pip", alert: true }] }] },
        ],
    };
    const alerts = kindleAlerts(brief, new Date("2026-11-10T08:00:00Z"));
    expect(alerts.groups).toEqual([
        { title: "Check On", lines: ["Malawi (Gismo): not seen"] },
        { title: "Maintenance: New", lines: ["Urgent: Dreamland: fence"] },
    ]);
    expect(alerts.allClear).toBe(false);
    expect(kindleAlerts({ sections: [] }).allClear).toBe(true);
});
