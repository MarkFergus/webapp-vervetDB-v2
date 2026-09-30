import { useRef, useState } from "react";
import { IconPlus, IconSquareRoundedX, IconTrash, IconUpload } from "@tabler/icons-react";
import { motion } from "motion/react";
import useDialog from "./useDialog";
import { checkForm, emptyForm, formFromMonkey, MAX_PHOTOS } from "./monkeyFormChecks";
import { deleteMonkey, saveMonkey } from "./monkeyData";
import { deletePhotos, uploadPhoto } from "./photoUpload";
import PhotoCropper from "./PhotoCropper";
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
    // Chosen photos waiting to be cropped: { files, index } (the one showing)
    const [cropQueue, setCropQueue] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProblem, setUploadProblem] = useState(null);

    const nameRef = useRef(null);
    const changed = JSON.stringify(form) !== JSON.stringify(initial);
    // Photos (and link boxes) still allowed, up to MAX_PHOTOS
    const spaceLeft = Math.max(0, MAX_PHOTOS - form.photos.length);
    const photosFull = spaceLeft === 0;
    // Photos uploaded while this form is open (tidied up if not kept)
    const uploadedHere = useRef([]);

    // Closing with unsaved changes asks first. (Escape while cropping just
    // closes the crop screen.) Photos uploaded but not saved are deleted.
    function requestClose() {
        if (cropQueue) {
            setCropQueue(null);
            return;
        }
        if (busy) return;
        if (changed && !window.confirm("Discard your changes?")) return;
        deletePhotos(uploadedHere.current);
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

    // Chosen photo(s): each is framed in the crop screen, then uploaded and
    // added to the list, one at a time
    function handleFiles(event) {
        const chosen = [...event.target.files];
        event.target.value = ""; // so choosing the same photo again still works
        if (!chosen.length) return;
        // Only as many as still fit (up to MAX_PHOTOS)
        const files = chosen.slice(0, spaceLeft);
        setUploadProblem(
            chosen.length > files.length
                ? `Only ${spaceLeft} more photo${spaceLeft === 1 ? "" : "s"} fit (${MAX_PHOTOS} is the most), so the first ${
                      spaceLeft === 1 ? "one" : spaceLeft
                  } will be used.`
                : null
        );
        if (files.length) setCropQueue({ files, index: 0 });
    }

    // Move on to the next chosen photo, or finish
    function nextPhoto(queue) {
        setCropQueue(queue.index + 1 < queue.files.length ? { ...queue, index: queue.index + 1 } : null);
    }

    async function handleCropped(blob) {
        const queue = cropQueue;
        setCropQueue(null);
        setUploading(true);
        setUploadProblem(null);
        try {
            const url = await uploadPhoto(blob, { troop: form.troop, name: form.name });
            uploadedHere.current.push(url);
            setForm((f) => ({ ...f, photos: [...f.photos, url] }));
        } catch (error) {
            setUploadProblem(error.message);
            setUploading(false);
            return; // don't carry on with the rest if one failed
        }
        setUploading(false);
        nextPhoto(queue);
    }

    const cropFile = cropQueue?.files[cropQueue.index];

    async function handleSave(event) {
        event.preventDefault();
        const { errors: found, values } = checkForm(form, troops);
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
                            Upload photos, or paste links (e.g. from ImgBB). The first
                            photo is shown on the card.
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
                        {uploadProblem && (
                            <span className="MonkeyForm-fieldError" role="alert">{uploadProblem}</span>
                        )}
                        <p className="MonkeyForm-uploading" role="status">
                            {uploading && "Uploading photo…"}
                        </p>
                        {photosFull && (
                            <p className="MonkeyForm-hint MonkeyForm-full">
                                {MAX_PHOTOS} photos is the most a monkey can have. Remove one
                                (bin icon) to add another.
                            </p>
                        )}
                        <div className="MonkeyForm-photoButtons">
                            {/* A label styled as a button: opens the phone's
                                camera / photo library, or a file picker */}
                            <label
                                className={
                                    uploading || photosFull
                                        ? "MonkeyForm-addPhoto is-disabled"
                                        : "MonkeyForm-addPhoto"
                                }
                            >
                                <IconUpload size={18} aria-hidden="true" /> Upload photo
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="visually-hidden"
                                    onChange={handleFiles}
                                    disabled={uploading || photosFull}
                                />
                            </label>
                            <button
                                type="button"
                                className="MonkeyForm-addPhoto"
                                onClick={addPhoto}
                                disabled={photosFull}
                            >
                                <IconPlus size={18} aria-hidden="true" /> Add photo link
                            </button>
                        </div>
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
                            {/* Not while a photo is still uploading */}
                            <button type="submit" className="MonkeyForm-button" disabled={busy || Boolean(uploading)}>
                                {busy ? "Saving…" : isNew ? "Add monkey" : "Save"}
                            </button>
                        </>
                    )}
                </div>
            </motion.form>

            {/* Framing a chosen photo (5:4) before it uploads */}
            {cropFile && (
                <PhotoCropper
                    key={cropQueue.index}
                    file={cropFile}
                    position={
                        cropQueue.files.length > 1
                            ? `Photo ${cropQueue.index + 1} of ${cropQueue.files.length}`
                            : null
                    }
                    onUse={handleCropped}
                    onCancel={() => nextPhoto(cropQueue)}
                />
            )}
        </div>
    );
}

export default MonkeyForm;
