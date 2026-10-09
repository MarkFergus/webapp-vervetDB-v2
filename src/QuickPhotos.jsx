import { useEffect, useMemo, useRef, useState } from "react";
import {
    IconArrowLeft,
    IconCheck,
    IconCrop,
    IconPhotoPlus,
    IconSearch,
    IconTrash,
    IconX,
} from "@tabler/icons-react";
import useDialog from "./useDialog";
import PhotoCropper from "./PhotoCropper";
import { cropPhoto, deletePhotos, uploadPhoto } from "./photoUpload";
import { saveMonkeyPhotos } from "./monkeyData";
import { thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import { MAX_PHOTOS } from "./monkeyFormChecks";
import {
    centreCrop,
    photoSlots,
    photosAfter,
    photoSuggestions,
    placeText,
    readyToUpload,
    realPhotos,
    searchMonkeys,
} from "./addPhotos";
import "./MonkeyForm.css";
import "./QuickPhotos.css";

// The most photos at a time (a batch after a photo round)
export const MAX_BATCH = 20;

let nextKey = 1;
// A chosen photo: { key, file, blob (cropped by hand, or null: the middle is
// used), monkeyId, replace (one of the monkey's photos to replace, when it
// has no room) }
const toItem = (file, monkeyId = null) => ({ key: nextKey++, file, blob: null, monkeyId, replace: null });

// A chosen (or cropped) photo on screen, through a temporary address that's
// tidied up when it's no longer shown
function LocalPhoto({ photo, ...props }) {
    const [src, setSrc] = useState(null);
    useEffect(() => {
        const url = URL.createObjectURL(photo);
        setSrc(url);
        return () => URL.revokeObjectURL(url);
    }, [photo]);
    return src ? <img src={src} {...props} /> : <span className={props.className} />;
}

// The middle of a chosen photo in the site's 5:4 shape, ready to upload
async function middleOf(file) {
    const url = URL.createObjectURL(file);
    try {
        const { width, height } = await photoSize(url);
        return await cropPhoto(url, centreCrop(width, height));
    } finally {
        URL.revokeObjectURL(url);
    }
}

// A photo's own size, to find its middle
function photoSize(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("That file doesn't look like a photo this browser can open."));
        img.src = url;
    });
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A monkey in the lists: its photo, name and where it lives
function MonkeyLine({ monkey, note }) {
    const photo = monkey.img[0];
    return (
        <>
            <img
                className="QuickPhotos-face"
                src={thumbUrl(photo)}
                alt=""
                loading="lazy"
                crossOrigin="anonymous"
                onError={fallbackTo(photo)}
            />
            <span className="QuickPhotos-who">
                <span className="QuickPhotos-name">{monkey.name}</span>
                <span className="QuickPhotos-place">
                    {placeText(monkey)}
                    {note && ` · ${note}`}
                </span>
            </span>
        </>
    );
}

// "2 photos", "No photo yet", "5 photos (full)"
function photoNote(monkey) {
    const count = realPhotos(monkey).length;
    if (count === 0) return "No photo yet";
    return count >= MAX_PHOTOS ? `${count} photos (full)` : plural(count, "photo");
}

// "Who is this?": search, or tap a suggestion
function WhoIsThis({ item, monkeys, suggestions, onChoose, onBack }) {
    const [query, setQuery] = useState("");
    const found = searchMonkeys(monkeys, query);
    const groups = query.trim() ? [{ title: found.length ? "Found" : "", monkeys: found }] : suggestions;
    return (
        <div className="QuickPhotos-picker">
            <div className="QuickPhotos-pickerTop">
                <LocalPhoto className="QuickPhotos-pickerPhoto" photo={item.blob ?? item.file} alt="The photo" />
                <label className="QuickPhotos-search">
                    <IconSearch size={18} aria-hidden="true" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Name or chip number"
                        aria-label="Search for the monkey"
                    />
                </label>
            </div>
            {query.trim() && found.length === 0 && <p className="QuickPhotos-none">No monkey matches “{query.trim()}”.</p>}
            {groups.map((group) => (
                <section key={group.title} className="QuickPhotos-group" aria-label={group.title || "Monkeys"}>
                    {group.title && <h3>{group.title}</h3>}
                    {group.monkeys.map((m) => (
                        <button key={m.id} type="button" className="QuickPhotos-option" onClick={() => onChoose(m)}>
                            <MonkeyLine monkey={m} note={photoNote(m)} />
                        </button>
                    ))}
                </section>
            ))}
            <button type="button" className="QuickPhotos-back" onClick={onBack}>
                <IconArrowLeft size={18} aria-hidden="true" />
                Back to the photos
            </button>
        </div>
    );
}

// Add Photos: photos already taken, each matched to its monkey, then all
// uploaded together. Each is cropped to the site's 5:4 shape: by hand
// (Crop), or the middle of the photo.
//   files:    the photos chosen to start with
//   monkeys:  every monkey (to choose from)
//   current:  the monkey it was opened for (every photo starts as theirs)
//   place:    the enclosure / introcage page it was opened on: { name, monkeys }
//   recent:   monkeys opened lately, newest first
//   onSaved(monkey): a monkey saved with its new photos
//   onOpenMonkey(monkey): "Open" at the end
//   onClose
function QuickPhotos({ files, monkeys, current = null, place = null, recent = [], onSaved, onOpenMonkey, onClose }) {
    const [items, setItems] = useState(() => files.slice(0, MAX_BATCH).map((f) => toItem(f, current?.id ?? null)));
    const [notice, setNotice] = useState(
        files.length > MAX_BATCH ? `Only ${MAX_BATCH} photos at a time, so the first ${MAX_BATCH} are here.` : null
    );
    // The photo whose "Who is this?" is open, or being cropped (its key)
    const [choosing, setChoosing] = useState(null);
    const [cropping, setCropping] = useState(null);
    // Uploading: { done, total }; finished: [{ monkey, count }]
    const [progress, setProgress] = useState(null);
    const [problem, setProblem] = useState(null);
    const [finished, setFinished] = useState(null);
    const [dragging, setDragging] = useState(false);
    const titleRef = useRef(null);
    const moreRef = useRef(null);

    const byId = useMemo(() => Object.fromEntries(monkeys.map((m) => [m.id, m])), [monkeys]);
    const slots = photoSlots(items, byId);
    const ready = readyToUpload(items, slots);
    const busy = progress !== null;

    function requestClose() {
        if (cropping !== null) return setCropping(null);
        if (choosing !== null) return setChoosing(null);
        if (busy) return;
        if (!finished && items.length && !window.confirm("Leave without uploading these photos?")) return;
        onClose();
    }
    useDialog(true, titleRef, { onClose: requestClose });

    const update = (key, changes) => setItems((list) => list.map((item) => (item.key === key ? { ...item, ...changes } : item)));
    const remove = (key) => setItems((list) => list.filter((item) => item.key !== key));
    // More photos (Add More, or dropped on a computer), up to MAX_BATCH
    function addFiles(chosen) {
        const photos = [...chosen].filter((f) => f.type.startsWith("image/"));
        const room = MAX_BATCH - items.length;
        setNotice(photos.length > room ? `Only ${MAX_BATCH} photos at a time, so ${room > 0 ? `the first ${room} were added` : "none were added"}.` : null);
        if (room > 0) setItems((list) => [...list, ...photos.slice(0, room).map((f) => toItem(f))]);
    }

    // The monkey chosen for the photo before this one (one tap for a burst
    // of the same monkey)
    function previousMonkey(key) {
        const at = items.findIndex((item) => item.key === key);
        for (let i = at - 1; i >= 0; i--) if (items[i].monkeyId != null) return byId[items[i].monkeyId];
        return null;
    }

    async function upload() {
        setProblem(null);
        // Each monkey's photos together, in the order chosen
        const groups = [];
        for (const item of items) {
            const group = groups.find((g) => g.id === item.monkeyId);
            if (group) group.items.push(item);
            else groups.push({ id: item.monkeyId, items: [item] });
        }
        const total = items.length;
        let done = 0;
        const results = [...(finished ?? [])];
        setProgress({ done, total });
        for (const group of groups) {
            const monkey = byId[group.id];
            const added = [];
            try {
                for (const item of group.items) {
                    const blob = item.blob ?? (await middleOf(item.file));
                    // (filed under where it lives, like the edit form's uploads)
                    const url = await uploadPhoto(blob, { troop: monkey.introcage ?? monkey.troop, name: monkey.name });
                    added.push({ url, replace: item.replace });
                    setProgress({ done: ++done, total });
                }
                const saved = await saveMonkeyPhotos(monkey.id, photosAfter(monkey, added));
                // The photos replaced aren't needed any more
                deletePhotos(added.map((a) => a.replace).filter(Boolean));
                onSaved(saved);
                results.push({ monkey: saved, count: added.length });
                const keys = new Set(group.items.map((item) => item.key));
                setItems((list) => list.filter((item) => !keys.has(item.key)));
            } catch (error) {
                // This monkey's photos weren't saved: tidy up the uploads
                deletePhotos(added.map((a) => a.url));
                setProblem(
                    `${error.message}${results.length ? ` (${results.map((r) => r.monkey.name).join(", ")} saved.)` : ""}`
                );
                setFinished(results.length ? results : null);
                setProgress(null);
                return;
            }
        }
        setProgress(null);
        setFinished(results);
    }

    const choosingItem = items.find((item) => item.key === choosing);
    const croppingItem = items.find((item) => item.key === cropping);
    const allDone = finished && items.length === 0;

    return (
        <div className="MonkeyForm QuickPhotos" role="dialog" aria-modal="true" aria-labelledby="QuickPhotos-title">
            <div className="MonkeyForm-overlay"></div>
            <div
                className={`MonkeyForm-window QuickPhotos-window${dragging ? " is-dragging" : ""}`}
                onDragOver={(e) => {
                    if (busy || allDone) return;
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    if (busy || allDone) return;
                    e.preventDefault();
                    setDragging(false);
                    addFiles(e.dataTransfer.files);
                }}
            >
                <div className="MonkeyForm-header">
                    <h1 id="QuickPhotos-title" tabIndex={-1} ref={titleRef}>
                        {choosingItem ? "Who is this?" : allDone ? "Photos Added" : "Add Photos"}
                    </h1>
                    <button type="button" className="MonkeyForm-close" onClick={requestClose} aria-label="Close" disabled={busy}>
                        <IconX size={22} aria-hidden="true" />
                    </button>
                </div>

                {choosingItem ? (
                    <div className="MonkeyForm-body">
                        <WhoIsThis
                            item={choosingItem}
                            monkeys={monkeys}
                            suggestions={photoSuggestions(monkeys, {
                                previous: previousMonkey(choosingItem.key),
                                current,
                                place,
                                recent,
                            })}
                            onChoose={(m) => {
                                update(choosingItem.key, { monkeyId: m.id, replace: null });
                                setChoosing(null);
                            }}
                            onBack={() => setChoosing(null)}
                        />
                    </div>
                ) : (
                    <>
                        <div className="MonkeyForm-body">
                            {/* Saved so far (all of them, at the end) */}
                            {finished && (
                                <section className="QuickPhotos-finished" aria-label="Saved">
                                    {finished.map(({ monkey, count }) => (
                                        <div key={monkey.id} className="QuickPhotos-savedRow">
                                            <IconCheck className="QuickPhotos-tick" size={20} aria-hidden="true" />
                                            <span className="QuickPhotos-savedText">
                                                {plural(count, "photo")} added to <strong>{monkey.name}</strong>
                                            </span>
                                            <button
                                                type="button"
                                                className="QuickPhotos-open"
                                                onClick={() => onOpenMonkey(monkey)}
                                                aria-label={`Open ${monkey.name}`}
                                            >
                                                Open
                                            </button>
                                        </div>
                                    ))}
                                </section>
                            )}

                            {items.length > 0 && (
                                <p className="MonkeyForm-hint QuickPhotos-hint">
                                    Choose who's in each photo. Photos are cropped to the middle, or tap Crop to frame one
                                    yourself.
                                </p>
                            )}
                            {notice && <p className="QuickPhotos-notice">{notice}</p>}

                            <ol className="QuickPhotos-list">
                                {items.map((item, i) => {
                                    const monkey = byId[item.monkeyId];
                                    const slot = slots[item.key];
                                    return (
                                        <li key={item.key} className="QuickPhotos-item" aria-label={`Photo ${i + 1}`}>
                                            <LocalPhoto className="QuickPhotos-photo" photo={item.blob ?? item.file} alt={`Photo ${i + 1}`} />
                                            <div className="QuickPhotos-details">
                                                <button
                                                    type="button"
                                                    className={`QuickPhotos-choose${monkey ? " is-chosen" : ""}`}
                                                    onClick={() => setChoosing(item.key)}
                                                    disabled={busy}
                                                    aria-label={monkey ? `Photo ${i + 1}: ${monkey.name} (change)` : `Photo ${i + 1}: Who is this?`}
                                                >
                                                    {monkey ? <MonkeyLine monkey={monkey} /> : <span className="QuickPhotos-ask">Who is this?</span>}
                                                </button>
                                                <div className="QuickPhotos-tools">
                                                    <button type="button" onClick={() => setCropping(item.key)} disabled={busy}>
                                                        <IconCrop size={16} aria-hidden="true" />
                                                        {item.blob ? "Cropped" : "Crop"}
                                                    </button>
                                                    <button type="button" onClick={() => remove(item.key)} disabled={busy} aria-label={`Remove photo ${i + 1}`}>
                                                        <IconTrash size={16} aria-hidden="true" />
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                            {/* No room: one of their photos to replace */}
                                            {slot?.full && (
                                                <fieldset className="QuickPhotos-replace">
                                                    <legend>
                                                        {monkey.name} has {MAX_PHOTOS} photos already. Replace:
                                                    </legend>
                                                    <div className="QuickPhotos-replaceChoices">
                                                        {[...slot.choices, ...(item.replace && !slot.choices.includes(item.replace) ? [item.replace] : [])].map((url) => {
                                                            const number = realPhotos(monkey).indexOf(url) + 1;
                                                            return (
                                                                <label key={url} className="QuickPhotos-replaceChoice">
                                                                    <input
                                                                        type="radio"
                                                                        name={`replace-${item.key}`}
                                                                        checked={item.replace === url}
                                                                        onChange={() => update(item.key, { replace: url })}
                                                                        disabled={busy}
                                                                        aria-label={`Replace ${monkey.name}'s photo ${number}`}
                                                                    />
                                                                    <img src={thumbUrl(url)} alt="" onError={fallbackTo(url)} />
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </fieldset>
                                            )}
                                        </li>
                                    );
                                })}
                            </ol>

                            {problem && (
                                <p className="MonkeyForm-problem" role="alert">
                                    {problem}
                                </p>
                            )}
                        </div>

                        <div className="MonkeyForm-footer">
                            {allDone ? (
                                <>
                                    <span className="MonkeyForm-spacer" />
                                    <button type="button" className="MonkeyForm-button is-save" onClick={onClose}>
                                        Done
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className="MonkeyForm-button is-quiet QuickPhotos-more"
                                        onClick={() => moreRef.current?.click()}
                                        disabled={busy || items.length >= MAX_BATCH}
                                    >
                                        <IconPhotoPlus size={16} aria-hidden="true" />
                                        Add More
                                    </button>
                                    <input
                                        ref={moreRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        hidden
                                        onChange={(e) => {
                                            addFiles(e.target.files);
                                            e.target.value = "";
                                        }}
                                    />
                                    <span className="MonkeyForm-spacer" />
                                    <button
                                        type="button"
                                        className="MonkeyForm-button is-save"
                                        onClick={upload}
                                        disabled={!ready || busy}
                                    >
                                        {busy
                                            ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
                                            : `Upload ${plural(items.length, "Photo")}`}
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>

            {croppingItem && (
                <PhotoCropper
                    file={croppingItem.file}
                    onUse={(blob) => {
                        update(croppingItem.key, { blob });
                        setCropping(null);
                    }}
                    onCancel={() => setCropping(null)}
                />
            )}
        </div>
    );
}

export default QuickPhotos;
