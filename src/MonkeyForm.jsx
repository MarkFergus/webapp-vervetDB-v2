import { useRef, useState } from "react";
import { IconPlus, IconSquareRoundedX, IconTrash } from "@tabler/icons-react";
import { motion } from "motion/react";
import useDialog from "./useDialog";
import { checkForm, emptyForm, formFromMonkey } from "./monkeyFormChecks";
import { deleteMonkey, saveMonkey } from "./monkeyData";
import "./MonkeyForm.css";

// Edit a monkey (monkey given) or add one (monkey null). Editors only.
//   troops:   troop names to choose from (without "All Troops")
//   troopIds: troop name → database id, needed to save
//   onSaved(savedMonkey) / onDeleted(id): after a successful save / delete
function MonkeyForm({ monkey, troops, troopIds, defaultTroop, onClose, onSaved, onDeleted }) {
    const isNew = !monkey;
    const [initial] = useState(() =>
        isNew ? emptyForm(troops.includes(defaultTroop) ? defaultTroop : "") : formFromMonkey(monkey)
    );
    const [form, setForm] = useState(initial);
    const [errors, setErrors] = useState({});
    const [problem, setProblem] = useState(null);
    const [busy, setBusy] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const nameRef = useRef(null);
    const changed = JSON.stringify(form) !== JSON.stringify(initial);

    // Closing with unsaved changes asks first
    function requestClose() {
        if (busy) return;
        if (changed && !window.confirm("Discard your changes?")) return;
        onClose();
    }
    useDialog(true, nameRef, { onClose: requestClose });

    const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

    function setPhoto(index, url) {
        setForm({ ...form, photos: form.photos.map((p, i) => (i === index ? url : p)) });
    }
    function removePhoto(index) {
        setForm({ ...form, photos: form.photos.filter((_, i) => i !== index) });
    }
    function addPhoto() {
        setForm({ ...form, photos: [...form.photos, ""] });
    }

    async function handleSave(event) {
        event.preventDefault();
        const { errors: found, values } = checkForm(form, troops);
        setErrors(found);
        setProblem(null);
        if (Object.keys(found).length) return;
        setBusy(true);
        try {
            const saved = await saveMonkey(values, troopIds, monkey?.id);
            onSaved(saved);
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }

    async function handleDelete() {
        setBusy(true);
        setProblem(null);
        try {
            await deleteMonkey(monkey.id);
            onDeleted(monkey.id);
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
            setConfirmingDelete(false);
        }
    }

    const title = isNew ? "Add a monkey" : `Edit ${monkey.name}`;
    const errorFor = (field) =>
        errors[field] && (
            <span className="MonkeyForm-fieldError" id={`MonkeyForm-${field}-error`}>
                {errors[field]}
            </span>
        );
    const describedBy = (field) => (errors[field] ? `MonkeyForm-${field}-error` : undefined);

    return (
        <div className="MonkeyForm" role="dialog" aria-modal="true" aria-labelledby="MonkeyForm-title">
            {/* Clicking outside does nothing, so a stray tap can't lose changes */}
            <div className="MonkeyForm-overlay"></div>
            <motion.form
                className="MonkeyForm-window"
                onSubmit={handleSave}
                noValidate
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, transition: { duration: 0.2 } }}
            >
                <div className="MonkeyForm-header">
                    <h1 id="MonkeyForm-title">{title}</h1>
                    <button type="button" className="MonkeyForm-close" onClick={requestClose} aria-label="Close">
                        <IconSquareRoundedX />
                    </button>
                </div>

                <div className="MonkeyForm-body">
                    <label className="MonkeyForm-field">
                        <span>Name <em>(required)</em></span>
                        <input
                            ref={nameRef}
                            value={form.name}
                            onChange={set("name")}
                            aria-invalid={Boolean(errors.name)}
                            aria-describedby={describedBy("name")}
                        />
                        {errorFor("name")}
                    </label>

                    <div className="MonkeyForm-row">
                        <label className="MonkeyForm-field">
                            <span>Troop <em>(required)</em></span>
                            <select
                                value={form.troop}
                                onChange={set("troop")}
                                aria-invalid={Boolean(errors.troop)}
                                aria-describedby={describedBy("troop")}
                            >
                                <option value="">Choose…</option>
                                {troops.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                            {errorFor("troop")}
                        </label>
                        <label className="MonkeyForm-field">
                            <span>Sex</span>
                            <select value={form.sex} onChange={set("sex")}>
                                <option value="female">Female</option>
                                <option value="male">Male</option>
                                <option value="">Not recorded</option>
                            </select>
                        </label>
                    </div>

                    <div className="MonkeyForm-row">
                        <label className="MonkeyForm-field">
                            <span>Birth year</span>
                            <input
                                inputMode="numeric"
                                placeholder="Unknown"
                                value={form.year}
                                onChange={set("year")}
                                aria-invalid={Boolean(errors.year)}
                                aria-describedby={describedBy("year")}
                            />
                            {errorFor("year")}
                        </label>
                        <label className="MonkeyForm-field">
                            <span>Chip</span>
                            <input
                                inputMode="numeric"
                                placeholder="None"
                                value={form.chip}
                                onChange={set("chip")}
                                aria-invalid={Boolean(errors.chip)}
                                aria-describedby={describedBy("chip") ?? "MonkeyForm-chip-hint"}
                            />
                            {errorFor("chip") || (
                                <span className="MonkeyForm-hint" id="MonkeyForm-chip-hint">
                                    Two chips? e.g. 1011 1604
                                </span>
                            )}
                        </label>
                    </div>

                    <fieldset className="MonkeyForm-photos">
                        <legend>Photo links</legend>
                        <p className="MonkeyForm-hint">
                            Paste links from ImgBB. The first photo is shown on the card.
                            {form.photos.length === 0 && " None yet: the placeholder photo will be used."}
                        </p>
                        {form.photos.map((url, i) => (
                            <div className="MonkeyForm-photo" key={i}>
                                {/* Small preview, to check it's the right monkey */}
                                {/^https:\/\/\S+$/.test(url.trim()) ? (
                                    <img src={url.trim()} alt="" />
                                ) : (
                                    <span className="MonkeyForm-noPreview" aria-hidden="true" />
                                )}
                                <input
                                    type="url"
                                    value={url}
                                    onChange={(e) => setPhoto(i, e.target.value)}
                                    aria-label={`Photo link ${i + 1}`}
                                    placeholder="https://i.ibb.co/…"
                                />
                                <button
                                    type="button"
                                    className="MonkeyForm-iconButton"
                                    onClick={() => removePhoto(i)}
                                    aria-label={`Remove photo ${i + 1}`}
                                >
                                    <IconTrash size={20} />
                                </button>
                            </div>
                        ))}
                        {errors.photos && (
                            <span className="MonkeyForm-fieldError" role="alert">{errors.photos}</span>
                        )}
                        <button type="button" className="MonkeyForm-addPhoto" onClick={addPhoto}>
                            <IconPlus size={18} aria-hidden="true" /> Add photo link
                        </button>
                    </fieldset>

                    <label className="MonkeyForm-field">
                        <span>Bio</span>
                        <textarea rows={4} value={form.bio} onChange={set("bio")} />
                    </label>

                    <label className="MonkeyForm-field">
                        <span>Distinctive features / behaviours</span>
                        <textarea rows={3} value={form.desc} onChange={set("desc")} />
                    </label>
                </div>

                <p className="MonkeyForm-problem" role="alert">
                    {problem ??
                        (Object.keys(errors).length > 0 && "Please fix the highlighted details.")}
                </p>

                <div className="MonkeyForm-footer">
                    {confirmingDelete ? (
                        <>
                            <span className="MonkeyForm-confirm">Delete {monkey.name} for good?</span>
                            <button type="button" className="MonkeyForm-button is-quiet" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                                Keep
                            </button>
                            <button type="button" className="MonkeyForm-button is-danger" onClick={handleDelete} disabled={busy}>
                                {busy ? "Deleting…" : "Delete"}
                            </button>
                        </>
                    ) : (
                        <>
                            {!isNew && (
                                <button
                                    type="button"
                                    className="MonkeyForm-button is-danger is-outline"
                                    onClick={() => setConfirmingDelete(true)}
                                    disabled={busy}
                                >
                                    Delete
                                </button>
                            )}
                            <span className="MonkeyForm-spacer" />
                            <button type="button" className="MonkeyForm-button is-quiet" onClick={requestClose} disabled={busy}>
                                Cancel
                            </button>
                            <button type="submit" className="MonkeyForm-button" disabled={busy}>
                                {busy ? "Saving…" : isNew ? "Add monkey" : "Save"}
                            </button>
                        </>
                    )}
                </div>
            </motion.form>
        </div>
    );
}

export default MonkeyForm;
