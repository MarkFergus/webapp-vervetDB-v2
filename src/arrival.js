// A new arrival's Arrival Reason (supabase/arrival-details.sql): its name
// on the page and in the form, in the form's order
export const ARRIVAL_REASONS = {
    orphaned: "Orphaned",
    injured: "Injured",
    confiscated: "Confiscated",
    surrendered: "Surrendered",
    // (born at the sanctuary: supabase/born-here.sql)
    born_here: "Born Here",
};

// The condition they arrived in, Condition Received (arrival-condition.sql)
export const ARRIVAL_CONDITIONS = {
    healthy: "Healthy",
    injured: "Injured",
    sick: "Sick",
};
