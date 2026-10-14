import { useEffect, useRef, useState } from "react";
import { fullName } from "./places";
import { motion } from "motion/react";
import useDialog from "./useDialog";
import { checkForm, chosenIntrocage, emptyForm, formFromMonkey, MAX_PHOTOS } from "./monkeyFormChecks";
import { deleteMonkey, saveArrivalInfo, saveMonkey, troopHome } from "./monkeyData";
import useArrivalInfo from "./useArrivalInfo";
import { placeChoices } from "./enclosures";
import { BABY_FEEDING, isBaby } from "./feeding";
import { deletePhotos } from "./photoUpload";
import PhotosField from "./PhotosField";
import { useAuth } from "./auth";
import "./MonkeyForm.css";
import CloseButton from "./CloseButton";

// Edit a monkey (monkey given) or add one (monkey null). Editors only.
//   troops:   troop names to choose from (without "All Troops")
//   troopIds: troop name → database id, needed to save
//   enclosures: for the Location box's introcages (only offered when
//               enclosuresLive: the database can save them)
//   onSaved(savedMonkey) / onDeleted(id): after a successful save / delete
// Birth years to choose from: this year back to 1997, or back to `current`
// if it's older (so an existing record never loses its year)
function birthYears(current) {
    const thisYear = new Date().getFullYear();
    const oldest = Math.min(1997, Number(current) || 1997);
    return Array.from({ length: thisYear - oldest + 1 }, (_, i) => String(thisYear - i));
}

function MonkeyForm({
    monkey, troops, troopIds, enclosures = [], enclosuresLive = false, defaultTroop, onClose, onSaved, onDeleted,
}) {
    const isNew = !monkey;
    const { isAdmin } = useAuth();
    // A new arrival always starts in a care unit (so its first location is
    // on record); it's moved to its long-term home afterwards, with Edit
    const careUnitsOnly = isNew && enclosuresLive;
    // Adding: a New Arrival (into a care unit) or Other (any enclosure and
    // location: e.g. a Bandit, or a monkey whose record is added late)
    const [kind, setKind] = useState("rescue");
    const other = careUnitsOnly && kind === "other";
    const rescue = careUnitsOnly && !other;
    // Enclosure → its troop and introcages, for the Enclosure + Location boxes
    const [careChoices] = useState(() => placeChoices(troops, enclosures, troopHome, enclosuresLive, careUnitsOnly));
    const [allChoices] = useState(() => placeChoices(troops, enclosures, troopHome, enclosuresLive));
    const choices = other ? allChoices : careChoices;
    const [initial] = useState(() =>
        isNew
            ? emptyForm(!careUnitsOnly && troops.includes(defaultTroop) ? defaultTroop : "")
            : formFromMonkey(monkey, careChoices)
    );
    const [form, setForm] = useState(initial);
    const [errors, setErrors] = useState({});
    const [problem, setProblem] = useState(null);
    const [busy, setBusy] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [uploading, setUploading] = useState(false);
    const photosRef = useRef(null);

    const nameRef = useRef(null);
    // Arrival Info (staff only; once the database has it): a new arrival's
    // details, in place of the Bio while it lives in a care unit
    const arrivalInfo = useArrivalInfo(monkey?.id ?? null, isNew ? rescue : true);
    const [arrival, setArrival] = useState("");
    const [arrivalSaved, setArrivalSaved] = useState("");
    useEffect(() => {
        if (!isNew && arrivalInfo.available) {
            setArrival(arrivalInfo.info);
            setArrivalSaved(arrivalInfo.info);
        }
    }, [isNew, arrivalInfo.available, arrivalInfo.info]);
    const showArrival = arrivalInfo.available && (isNew ? rescue : true);
    const inCareUnit = isNew ? rescue : chosenIntrocage(form, choices)?.type === "area";
    const hideBio = showArrival && inCareUnit;
    const changed = JSON.stringify(form) !== JSON.stringify(initial) || arrival !== arrivalSaved;
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
    // (a block or care unit has no troop: an introcage / area needs
    // choosing, unless it has only one, like Quarantine)
    const chooseEnclosure = (event) => {
        const chosen = choices.find((c) => c.key === event.target.value);
        const onlyArea = chosen?.noTroop && chosen.introcages.length === 1 ? String(chosen.introcages[0].id) : "";
        setForm({ ...form, troop: event.target.value, location: chosen && !chosen.noTroop ? "troop" : onlyArea });
    };
    const choice = choices.find((c) => c.key === form.troop);
    // New Arrival / Other: starting the Enclosure and Location boxes again
    // for the other kind
    function chooseKind(next) {
        if (next === kind) return;
        setKind(next);
        setErrors({});
        setForm({ ...form, troop: "", location: "", chip: "", chipUnknown: false });
    }
    // Feeding: for a monkey in an introcage (not a troop, or a care unit's
    // area), once the database has it
    const showFeeding = Boolean(form.feeding) && chosenIntrocage(form, choices)?.type === "introcage";
    const setFeeding = (field, value) => setForm({ ...form, feeding: { ...form.feeding, [field]: value } });
    // Babies' plates are always cut small with fruit
    const baby = isBaby({ year: form.year });

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
            // Arrival Info is kept apart (staff only); the monkey is already saved
            if (showArrival && arrival.trim() !== arrivalSaved.trim()) {
                try {
                    await saveArrivalInfo(saved.id, arrival);
                } catch (error) {
                    window.alert(`${saved.name} was saved, but the Arrival Info wasn't: ${error.message} Please open Edit to add it again.`);
                }
            }
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

    const title = isNew ? "Add New Monkey" : `Edit ${monkey.name}`;
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
                    <CloseButton className="MonkeyForm-close" onClick={requestClose} />
                </div>

                <div className="MonkeyForm-body">
                    {/* Adding: a New Arrival or Other */}
                    {careUnitsOnly && (
                        <div className="MonkeyForm-kind" role="group" aria-label="Type">
                            {[["rescue", "New Arrival"], ["other", "Other"]].map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    aria-pressed={kind === id}
                                    onClick={() => chooseKind(id)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
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
                            <span>{rescue ? "Care Unit" : "Enclosure"} <em>(required)</em></span>
                            <select
                                value={form.troop}
                                onChange={chooseEnclosure}
                                aria-invalid={Boolean(errors.troop)}
                                aria-describedby={describedBy("troop")}
                            >
                                <option value="">Choose…</option>
                                {choices.map((c) => (
                                    <option key={c.key} value={c.key}>{fullName(c.enclosure)}</option>
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
                                        {!choice.noTroop && <option value="troop">{fullName(choice.troop)} Troop</option>}
                                        {choice.introcages.map((i) => (
                                            <option key={i.id} value={String(i.id)}>{fullName(i.name)}</option>
                                        ))}
                                    </>
                                )}
                            </select>
                            {errorFor("location")}
                        </label>
                    </div>
                    {rescue && (
                        <p className="MonkeyForm-hint">
                            New arrivals start in a care unit. Once they have a long-term home, move them there with Edit.
                        </p>
                    )}

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
                            {/* This year back to 1997 (or further, if this
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

                    {/* (a new arrival has no chip yet: saved as No Chip, added later with Edit) */}
                    {!rescue && (
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
                    )}

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

                    {!hideBio && (
                        <label className="MonkeyForm-field">
                            <span>Bio</span>
                            <textarea rows={4} value={form.bio} onChange={set("bio")} />
                        </label>
                    )}

                    {/* A new arrival's arrival details: staff only, up to 2000 characters */}
                    {showArrival && (
                        <label className="MonkeyForm-field">
                            <span>Arrival Info <em>(staff only)</em></span>
                            <textarea rows={5} value={arrival} maxLength={2000} onChange={(e) => setArrival(e.target.value)} />
                        </label>
                    )}

                    <label className="MonkeyForm-field">
                        <span>Distinctive features / behaviours</span>
                        <textarea rows={3} value={form.desc} onChange={set("desc")} />
                    </label>

                    {/* Feeding (introcage monkeys), at the bottom: who feeds it, and its AM
                        plates and PM bowls if it's the Local Team */}
                    {showFeeding && (
                        <fieldset className="MonkeyForm-feeding">
                            <legend>Feeding</legend>
                            <div className="MonkeyForm-row MonkeyForm-feedRow">
                                <label className="MonkeyForm-field">
                                    <span>Fed By</span>
                                    <select value={form.feeding.fedBy} onChange={(e) => setFeeding("fedBy", e.target.value)}>
                                        <option value="localTeam">Local Team</option>
                                        <option value="sickbay">Sickbay</option>
                                    </select>
                                </label>
                            </div>
                            {monkey?.inSickbay && (
                                <p className="MonkeyForm-hint">
                                    Currently in Sickbay, so fed by Sickbay until they return. This setting applies
                                    again then.
                                </p>
                            )}
                            {form.feeding.fedBy === "sickbay" ? (
                                <p className="MonkeyForm-hint">
                                    Sickbay delivers its plates (Special Plates on the AM Plates List).
                                </p>
                            ) : (
                                <>
                                    <div className="MonkeyForm-row MonkeyForm-feedRow">
                                        {/* A baby's feed is fixed (see BABY_FEEDING): shown, but locked */}
                                        <label className="MonkeyForm-field">
                                            <span>AM Plates</span>
                                            <select
                                                value={baby ? BABY_FEEDING.amPlates : form.feeding.amPlates}
                                                disabled={baby}
                                                onChange={(e) => setFeeding("amPlates", Number(e.target.value))}
                                            >
                                                <option value={1}>1 Plate</option>
                                                <option value={2}>2 Plates</option>
                                            </select>
                                        </label>
                                        <div className="MonkeyForm-checks" role="group" aria-label="AM plate extras">
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={baby || form.feeding.amCutSmall}
                                                    disabled={baby}
                                                    onChange={(e) => setFeeding("amCutSmall", e.target.checked)}
                                                />
                                                Cut Small
                                            </label>
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={baby || form.feeding.amFruit}
                                                    disabled={baby}
                                                    onChange={(e) => setFeeding("amFruit", e.target.checked)}
                                                />
                                                Add Fruit
                                            </label>
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={form.feeding.amMetalPlate}
                                                    onChange={(e) => setFeeding("amMetalPlate", e.target.checked)}
                                                />
                                                Metal Plate
                                            </label>
                                        </div>
                                    </div>
                                    <div className="MonkeyForm-row MonkeyForm-feedRow">
                                        <label className="MonkeyForm-field">
                                            <span>PM Bowls</span>
                                            <select
                                                value={baby ? BABY_FEEDING.pmBowls : form.feeding.pmBowls}
                                                disabled={baby}
                                                onChange={(e) => setFeeding("pmBowls", Number(e.target.value))}
                                            >
                                                <option value={1}>1 Bowl</option>
                                                <option value={2}>2 Bowls</option>
                                            </select>
                                        </label>
                                        <div className="MonkeyForm-checks" role="group" aria-label="PM bowl extras">
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={baby || form.feeding.pmCutSmall}
                                                    disabled={baby}
                                                    onChange={(e) => setFeeding("pmCutSmall", e.target.checked)}
                                                />
                                                Cut Small
                                            </label>
                                        </div>
                                    </div>
                                </>
                            )}
                        </fieldset>
                    )}
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
