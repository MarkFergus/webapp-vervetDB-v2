import { useRef, useState } from "react";
import { IconSquareRoundedX } from "@tabler/icons-react";
import { motion } from "motion/react";
import useDialog from "./useDialog";
import { checkForm, chosenIntrocage, emptyForm, formFromMonkey, MAX_PHOTOS } from "./monkeyFormChecks";
import { deleteMonkey, saveMonkey, troopHome } from "./monkeyData";
import { placeChoices } from "./enclosures";
import { deletePhotos } from "./photoUpload";
import PhotosField from "./PhotosField";
import { useAuth } from "./auth";
import "./MonkeyForm.css";

// Edit a monkey (monkey given) or add one (monkey null). Editors only.
//   troops:   troop names to choose from (without "All Troops")
//   troopIds: troop name → database id, needed to save
//   enclosures: for the Location box's introcages (only offered when
//               enclosuresLive: the database can save them)
//   onSaved(savedMonkey) / onDeleted(id): after a successful save / delete
// Birth years to choose from: this year back to 2000, or back to `current`
// if it's older (so an existing record never loses its year)
function birthYears(current) {
    const thisYear = new Date().getFullYear();
    const oldest = Math.min(2000, Number(current) || 2000);
    return Array.from({ length: thisYear - oldest + 1 }, (_, i) => String(thisYear - i));
}

function MonkeyForm({
    monkey, troops, troopIds, enclosures = [], enclosuresLive = false, defaultTroop, onClose, onSaved, onDeleted,
}) {
    const isNew = !monkey;
    const { isAdmin } = useAuth();
    // Enclosure → its troop and introcages, for the Enclosure + Location boxes
    const [choices] = useState(() => placeChoices(troops, enclosures, troopHome, enclosuresLive));
    const [initial] = useState(() =>
        isNew ? emptyForm(troops.includes(defaultTroop) ? defaultTroop : "") : formFromMonkey(monkey, choices)
    );
    const [form, setForm] = useState(initial);
    const [errors, setErrors] = useState({});
    const [problem, setProblem] = useState(null);
    const [busy, setBusy] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [uploading, setUploading] = useState(false);
    const photosRef = useRef(null);

    const nameRef = useRef(null);
    const changed = JSON.stringify(form) !== JSON.stringify(initial);
    // Photos uploaded while this form is open (tidied up if not kept)
    const uploadedHere = useRef([]);

    // Closing with unsaved changes asks first. (Escape while cropping just
    // closes the crop screen.) Photos uploaded but not saved are deleted.
    function requestClose() {
        if (photosRef.current?.cancelCrop()) return;
        if (busy) return;
        if (changed && !window.confirm("Discard your changes?")) return;
        deletePhotos(uploadedHere.current);
        onClose();
    }
    useDialog(true, nameRef, { onClose: requestClose });

    const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });
    // A new enclosure: with its troop to start with
    const chooseEnclosure = (event) =>
        setForm({ ...form, troop: event.target.value, location: event.target.value && "troop" });
    const choice = choices.find((c) => c.troop === form.troop);

    // Chip unknown: empties the box and leaves it (closing the phone
    // keyboard). "Clear" undoes it the same way; so does typing a number.
    const [chipFocused, setChipFocused] = useState(false);
    const chipRef = useRef(null);
    function chooseChipUnknown() {
        setForm({ ...form, chip: "", chipUnknown: true });
        chipRef.current?.blur();
    }
    function clearChipUnknown() {
        setForm({ ...form, chipUnknown: false });
        chipRef.current?.blur();
    }

    async function handleSave(event) {
        event.preventDefault();
        const { errors: found, values } = checkForm(form, choices);
        setErrors(found);
        setProblem(null);
        if (Object.keys(found).length) return;
        setBusy(true);
        try {
            const saved = await saveMonkey(values, troopIds, monkey?.id);
            // Tidy up: photos this monkey had, or that were uploaded here,
            // but that aren't kept (only ones uploaded to our storage)
            const before = [...(monkey?.img ?? []), ...uploadedHere.current];
            deletePhotos(before.filter((url) => !saved.img.includes(url)));
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
            // Its uploaded photos go too
            deletePhotos([...monkey.img, ...uploadedHere.current]);
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

                    {/* Where it lives: its enclosure, then with the troop
                        or in one of that enclosure's introcages */}
                    <div className="MonkeyForm-row">
                        <label className="MonkeyForm-field">
                            <span>Enclosure <em>(required)</em></span>
                            <select
                                value={form.troop}
                                onChange={chooseEnclosure}
                                aria-invalid={Boolean(errors.troop)}
                                aria-describedby={describedBy("troop")}
                            >
                                <option value="">Choose…</option>
                                {choices.map((c) => (
                                    <option key={c.troop} value={c.troop}>{c.enclosure}</option>
                                ))}
                            </select>
                            {errorFor("troop")}
                        </label>
                        <label className="MonkeyForm-field">
                            <span>Location <em>(required)</em></span>
                            <select
                                value={form.location}
                                onChange={set("location")}
                                disabled={!choice}
                                aria-invalid={Boolean(errors.location)}
                                aria-describedby={describedBy("location")}
                            >
                                {!choice && <option value="">Choose an enclosure first</option>}
                                {choice && form.location === "" && <option value="">Choose…</option>}
                                {choice && (
                                    <>
                                        <option value="troop">{choice.troop} Troop</option>
                                        {choice.introcages.map((i) => (
                                            <option key={i.id} value={String(i.id)}>{i.name}</option>
                                        ))}
                                    </>
                                )}
                            </select>
                            {errorFor("location")}
                        </label>
                    </div>

                    <div className="MonkeyForm-row">
                        <label className="MonkeyForm-field">
                            <span>Sex</span>
                            <select value={form.sex} onChange={set("sex")}>
                                <option value="female">Female</option>
                                <option value="male">Male</option>
                                <option value="">Unknown</option>
                            </select>
                        </label>
                        <label className="MonkeyForm-field">
                            <span>Birth year</span>
                            {/* This year back to 2000 (or further, if this
                                monkey's recorded year is older) */}
                            <select
                                value={form.year}
                                onChange={set("year")}
                                aria-invalid={Boolean(errors.year)}
                                aria-describedby={describedBy("year")}
                            >
                                <option value="">Unknown</option>
                                {birthYears(form.year).map((y) => (
                                    <option key={y} value={y}>
                                        {y}
                                    </option>
                                ))}
                            </select>
                            {errorFor("year")}
                        </label>
                    </div>

                    <div className="MonkeyForm-row">
                        {/* While the box (or the button) has focus, the name
                            has "Unknown?" beside it, or "Clear" once chosen
                            (back to blank: no chip) */}
                        <div
                            className="MonkeyForm-field"
                            onFocus={() => setChipFocused(true)}
                            onBlur={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget)) {
                                    setChipFocused(false);
                                }
                            }}
                        >
                            <span className="MonkeyForm-labelRow">
                                <label htmlFor="MonkeyForm-chip">Chip</label>
                                {chipFocused && (
                                    <button
                                        type="button"
                                        className="MonkeyForm-unknown"
                                        // Keeps focus in the box, so a tap
                                        // doesn't hide the button first
                                        onPointerDown={(event) => event.preventDefault()}
                                        onClick={form.chipUnknown ? clearChipUnknown : chooseChipUnknown}
                                    >
                                        {form.chipUnknown ? "Clear" : "Unknown?"}
                                    </button>
                                )}
                            </span>
                            <input
                                id="MonkeyForm-chip"
                                ref={chipRef}
                                // Digits plus , or . to separate two chips
                                inputMode="decimal"
                                placeholder={form.chipUnknown ? "Unknown" : "No Chip"}
                                value={form.chip}
                                onChange={(event) =>
                                    setForm({ ...form, chip: event.target.value, chipUnknown: false })
                                }
                                aria-invalid={Boolean(errors.chip)}
                                aria-describedby={
                                    describedBy("chip") ?? (chipFocused ? "MonkeyForm-chip-hint" : undefined)
                                }
                            />
                            {/* Hints only while typing; a problem always shows */}
                            {errorFor("chip") || (chipFocused && (
                                <ul className="MonkeyForm-hint MonkeyForm-hintList" id="MonkeyForm-chip-hint">
                                    <li>{form.chipUnknown ? "Press Clear if no chip" : "Leave blank if no chip"}</li>
                                    <li>Two chips? e.g. 1011,1604</li>
                                </ul>
                            ))}
                        </div>
                    </div>

                    <PhotosField
                        ref={photosRef}
                        photos={form.photos}
                        onChange={(update) => setForm((f) => ({ ...f, photos: update(f.photos) }))}
                        // Saved in the folder of its troop or introcage
                        uploadTo={() => ({ troop: chosenIntrocage(form, choices)?.name ?? form.troop, name: form.name })}
                        uploadedHere={uploadedHere}
                        uploading={uploading}
                        onUploadingChange={setUploading}
                        error={errors.photos}
                        hint={
                            <>
                                The primary photo (★) is shown on the card and in the
                                Profile Book; use ⋮ to change it or delete a photo.
                                {form.photos.length === 0 && " None yet: the placeholder photo will be used."}
                            </>
                        }
                        full={`${MAX_PHOTOS} photos is the most a monkey can have. Delete one (⋮ → Delete photo) to add another.`}
                    />

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
                            {/* Only admins can delete (the database enforces it too) */}
                            {!isNew && isAdmin && (
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
                            {/* Not while a photo is still uploading */}
                            <button type="submit" className="MonkeyForm-button is-save" disabled={busy || Boolean(uploading)}>
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
