import { useRef, useState } from "react";
import { IconSquareRoundedX } from "@tabler/icons-react";
import { motion } from "motion/react";
import useDialog from "./useDialog";
import { saveEnclosure } from "./monkeyData";
import { deletePhotos } from "./photoUpload";
import { MAX_PHOTOS } from "./monkeyFormChecks";
import PhotosField from "./PhotosField";
import "./MonkeyForm.css";
import "./EnclosureForm.css";

// Editing an enclosure's or introcage's details (editors only), in the same
// window as the monkey form: Photos, About (troop enclosures), Features,
// Size and Established (troop enclosures, month and year); introcages also
// Troop Door, Plate Slot (yes / no) and Sleeping Perches (1–10).
//   onSaved(savedEnclosure) after a successful save

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

// Yes / no details: true / false / null (not recorded) ⇄ the box's "yes" / "no" / ""
const toYesNo = (value) => (value === true ? "yes" : value === false ? "no" : "");
const fromYesNo = (text) => (text === "yes" ? true : text === "no" ? false : null);
const PERCHES = Array.from({ length: 10 }, (_, i) => String(i + 1));

// A yes / no box, blank for "not recorded"
function YesNoField({ label, value, onChange }) {
    return (
        <label className="MonkeyForm-field">
            <span>{label}</span>
            <select value={value} onChange={onChange}>
                <option value="">Not recorded</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
            </select>
        </label>
    );
}

// Years to choose from: this year back to 1990 (or further, for an older one)
function years(current) {
    const thisYear = new Date().getFullYear();
    const oldest = Math.min(1990, Number(current) || 1990);
    return Array.from({ length: thisYear - oldest + 1 }, (_, i) => String(thisYear - i));
}

function EnclosureForm({ enclosure, onClose, onSaved }) {
    const isIntrocage = enclosure.type === "introcage";
    // (only once the database has them: see introcage-fields.sql)
    const hasIntrocageDetails = isIntrocage && "troopDoor" in enclosure;
    const [year, month] = enclosure.established ? enclosure.established.split("-") : ["", ""];
    const [initial] = useState({
        description: enclosure.description ?? "",
        features: enclosure.features ?? "",
        size: enclosure.size == null ? "" : String(enclosure.size),
        year,
        month,
        photos: enclosure.photos ?? [],
        ...(hasIntrocageDetails && {
            troopDoor: toYesNo(enclosure.troopDoor),
            plateSlot: toYesNo(enclosure.plateSlot),
            sleepingPerches: enclosure.sleepingPerches == null ? "" : String(enclosure.sleepingPerches),
        }),
    });
    const [form, setForm] = useState(initial);
    const [problem, setProblem] = useState(null);
    const [busy, setBusy] = useState(false);
    const [uploading, setUploading] = useState(false);
    const firstRef = useRef(null);
    const photosRef = useRef(null);
    // Photos uploaded while this form is open (tidied up if not kept)
    const uploadedHere = useRef([]);
    const changed = JSON.stringify(form) !== JSON.stringify(initial);

    // Escape while cropping just closes the crop screen. Photos uploaded but
    // not saved are deleted.
    function requestClose() {
        if (photosRef.current?.cancelCrop()) return;
        if (busy) return;
        if (changed && !window.confirm("Discard your changes?")) return;
        deletePhotos(uploadedHere.current);
        onClose();
    }
    useDialog(true, firstRef, { onClose: requestClose });

    const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });
    // A year without a month (or the other way round) can't be saved
    const halfDate = Boolean(form.year) !== Boolean(form.month);
    // Size: a whole number of square metres, or blank (commas and spaces ignored)
    const sizeText = form.size.replace(/[\s,]/g, "");
    const size = sizeText === "" ? null : Number(sizeText);
    const badSize = size !== null && !(/^\d+$/.test(sizeText) && size > 0 && size < 1e9);

    async function handleSave(event) {
        event.preventDefault();
        if (halfDate) {
            setProblem("Please choose both a month and a year, or neither.");
            return;
        }
        if (badSize) {
            setProblem("Size should be a whole number of square metres, e.g. 600, or left blank.");
            return;
        }
        setBusy(true);
        setProblem(null);
        const changes = { features: form.features.trim(), size, photos: form.photos };
        if (!isIntrocage) {
            changes.description = form.description.trim();
            changes.established = form.year ? `${form.year}-${form.month}` : null;
        }
        if (hasIntrocageDetails) {
            changes.troopDoor = fromYesNo(form.troopDoor);
            changes.plateSlot = fromYesNo(form.plateSlot);
            changes.sleepingPerches = form.sleepingPerches ? Number(form.sleepingPerches) : null;
        }
        try {
            const saved = await saveEnclosure(enclosure, changes);
            // Tidy up: uploaded photos it had, or that were uploaded here,
            // but that aren't kept
            const before = [...(enclosure.photos ?? []), ...uploadedHere.current];
            deletePhotos(before.filter((url) => !saved.photos.includes(url)));
            onSaved(saved);
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }

    return (
        <div className="MonkeyForm" role="dialog" aria-modal="true" aria-labelledby="EnclosureForm-title">
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
                    <h1 id="EnclosureForm-title">Edit {enclosure.name}</h1>
                    <button type="button" className="MonkeyForm-close" onClick={requestClose} aria-label="Close">
                        <IconSquareRoundedX />
                    </button>
                </div>

                <div className="MonkeyForm-body">
                    <PhotosField
                        ref={photosRef}
                        photos={form.photos}
                        onChange={(update) => setForm((f) => ({ ...f, photos: update(f.photos) }))}
                        uploadTo={() => ({ troop: "enclosures", name: enclosure.name })}
                        uploadedHere={uploadedHere}
                        uploading={uploading}
                        onUploadingChange={setUploading}
                        hint={
                            <>
                                The primary photo (★) is shown on the card and first on
                                the page; use ⋮ to change it or delete a photo.
                                {form.photos.length === 0 && " None yet: its monkeys' photos are shown instead."}
                            </>
                        }
                        full={`${MAX_PHOTOS} photos is the most. Delete one (⋮ → Delete photo) to add another.`}
                    />

                    {!isIntrocage && (
                        <label className="MonkeyForm-field">
                            <span>About</span>
                            <textarea
                                ref={firstRef}
                                rows={5}
                                value={form.description}
                                onChange={set("description")}
                                placeholder="What it's like, its history, anything worth knowing"
                            />
                        </label>
                    )}

                    <label className="MonkeyForm-field">
                        {/* Introcages: their one description */}
                        <span>{isIntrocage ? "Description" : "Features"}</span>
                        <textarea
                            ref={isIntrocage ? firstRef : undefined}
                            rows={4}
                            value={form.features}
                            onChange={set("features")}
                            placeholder={isIntrocage ? "What it's like, anything worth knowing" : "e.g. Pool, two shelters, climbing frame"}
                        />
                    </label>

                    <div className="MonkeyForm-row">
                        <label className="MonkeyForm-field">
                            <span>Size</span>
                            {/* Just the number: shown as "600 m²" */}
                            <span className="EnclosureForm-unitBox">
                                <input
                                    inputMode="numeric"
                                    value={form.size}
                                    onChange={set("size")}
                                    placeholder="e.g. 600"
                                    aria-invalid={badSize}
                                    aria-describedby="EnclosureForm-sizeUnit"
                                />
                                <span className="EnclosureForm-unit" id="EnclosureForm-sizeUnit" aria-hidden="true">
                                    m²
                                </span>
                            </span>
                        </label>
                        {!isIntrocage && (
                            <fieldset className="EnclosureForm-date">
                                <legend>Established</legend>
                                <select
                                    value={form.month}
                                    onChange={set("month")}
                                    aria-label="Established month"
                                    aria-invalid={halfDate && !form.month}
                                >
                                    <option value="">Month…</option>
                                    {MONTHS.map((name, i) => (
                                        <option key={name} value={String(i + 1).padStart(2, "0")}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={form.year}
                                    onChange={set("year")}
                                    aria-label="Established year"
                                    aria-invalid={halfDate && !form.year}
                                >
                                    <option value="">Year…</option>
                                    {years(form.year).map((y) => (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    ))}
                                </select>
                            </fieldset>
                        )}
                        {hasIntrocageDetails && (
                            <label className="MonkeyForm-field">
                                <span>Sleeping Perches</span>
                                <select value={form.sleepingPerches} onChange={set("sleepingPerches")}>
                                    <option value="">Not recorded</option>
                                    {PERCHES.map((n) => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>
                    {hasIntrocageDetails && (
                        <div className="MonkeyForm-row">
                            <YesNoField label="Troop Door" value={form.troopDoor} onChange={set("troopDoor")} />
                            <YesNoField label="Plate Slot" value={form.plateSlot} onChange={set("plateSlot")} />
                        </div>
                    )}
                </div>

                <p className="MonkeyForm-problem" role="alert">
                    {problem}
                </p>

                <div className="MonkeyForm-footer">
                    <span className="MonkeyForm-spacer" />
                    <button type="button" className="MonkeyForm-button is-quiet" onClick={requestClose} disabled={busy}>
                        Cancel
                    </button>
                    {/* Not while a photo is still uploading */}
                    <button type="submit" className="MonkeyForm-button is-save" disabled={busy || uploading}>
                        {busy ? "Saving…" : "Save"}
                    </button>
                </div>
            </motion.form>
        </div>
    );
}

export default EnclosureForm;
