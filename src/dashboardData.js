// My Dashboard's own data (supabase/staff-dashboard.sql): the signed-in
// person's to-do list, weekly and monthly checklists and sections. Each
// person sees and changes only their own (the database makes sure).
import { supabase } from "./supabase";

// A database refusal, readable
function problem(error, what) {
    console.error(`${what} failed:`, error);
    if (["42P01", "PGRST205"].includes(error?.code)) return new Error("My Dashboard needs supabase/staff-dashboard.sql to be run first.");
    if (error?.code === "42501") return new Error("The database didn't allow this. Are you still signed in?");
    if (error?.code === "23514") return new Error("The database refused that. Please check what's typed.");
    return new Error("Couldn't save that just now. Please check your connection and try again.");
}

const toTodo = (row) => ({ id: row.id, text: row.text, dueOn: row.due_on, doneAt: row.done_at, createdAt: row.created_at });
const toItem = (row) => ({ id: row.id, every: row.every, text: row.text, position: row.position });

// Everything at once: { todos, items, ticks: [{ itemId, period }], sections }.
// Throws "not-ready" (error.notReady) before staff-dashboard.sql has run.
export async function loadDashboard(periods) {
    const [todos, items, ticks, settings] = await Promise.all([
        supabase.from("staff_todos").select("id, text, due_on, done_at, created_at").order("created_at"),
        supabase.from("staff_checklist_items").select("id, every, text, position").order("position").order("id"),
        supabase.from("staff_checklist_ticks").select("item_id, period").in("period", periods),
        supabase.from("staff_dashboard_settings").select("sections").maybeSingle(),
    ]);
    const failed = [todos, items, ticks, settings].find((r) => r.error);
    if (failed) {
        const error = problem(failed.error, "Loading My Dashboard");
        error.notReady = ["42P01", "PGRST205"].includes(failed.error.code);
        throw error;
    }
    return {
        todos: todos.data.map(toTodo),
        items: items.data.map(toItem),
        ticks: ticks.data.map((t) => ({ itemId: t.item_id, period: t.period })),
        sections: settings.data?.sections ?? [],
    };
}

// ---- To-do ----

export async function addTodo({ text, dueOn = null }) {
    const { data, error } = await supabase
        .from("staff_todos")
        .insert({ text, due_on: dueOn || null })
        .select("id, text, due_on, done_at, created_at")
        .single();
    if (error) throw problem(error, "Adding a to-do");
    return toTodo(data);
}

export async function setTodoDone(id, done) {
    const { data, error } = await supabase
        .from("staff_todos")
        .update({ done_at: done ? new Date().toISOString() : null })
        .eq("id", id)
        .select("id, text, due_on, done_at, created_at")
        .single();
    if (error) throw problem(error, "Ticking a to-do");
    return toTodo(data);
}

export async function deleteTodos(ids) {
    if (!ids.length) return;
    const { error } = await supabase.from("staff_todos").delete().in("id", ids);
    if (error) throw problem(error, "Deleting to-dos");
}

// ---- Checklists ----

export async function addChecklistItem({ every, text, position }) {
    const { data, error } = await supabase
        .from("staff_checklist_items")
        .insert({ every, text, position })
        .select("id, every, text, position")
        .single();
    if (error) throw problem(error, "Adding a checklist item");
    return toItem(data);
}

export async function deleteChecklistItem(id) {
    const { error } = await supabase.from("staff_checklist_items").delete().eq("id", id);
    if (error) throw problem(error, "Deleting a checklist item");
}

export async function setTicked(itemId, period, ticked) {
    const { error } = ticked
        ? await supabase.from("staff_checklist_ticks").upsert({ item_id: itemId, period }, { onConflict: "item_id,period", ignoreDuplicates: true })
        : await supabase.from("staff_checklist_ticks").delete().eq("item_id", itemId).eq("period", period);
    if (error) throw problem(error, "Ticking a checklist item");
}

// ---- My Sections ----

export async function saveSections(sections) {
    const { error } = await supabase.from("staff_dashboard_settings").upsert({ sections }, { onConflict: "user_id" });
    if (error) throw problem(error, "Saving My Sections");
}
