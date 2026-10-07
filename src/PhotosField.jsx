import { useImperativeHandle, useState } from "react";
import { createPortal } from "react-dom";
import { IconStarFilled, IconUpload } from "@tabler/icons-react";
import { uploadPhoto } from "./photoUpload";
import PhotoCropper from "./PhotoCropper";
import PhotoOptions from "./PhotoOptions";
import { MAX_PHOTOS } from "./monkeyFormChecks";

// The Photos part of the monkey and enclosure forms (styles in
// MonkeyForm.css): previews with a ⋮ menu each (make primary / delete), and
// "Upload new photo", which frames each chosen photo in the crop screen
// before uploading it. The first photo is the primary one.
//   photos:        the photos' web addresses, primary first
//   onChange(update): update is a function (photos → new photos)
//   uploadTo():    where uploads go: { troop (the folder), name }
//   uploadedHere:  a ref listing photos uploaded while the form is open (so
//                  the form can tidy up ones that aren't kept)
//   uploading / onUploadingChange: whether a photo is uploading (the form
//                  doesn't save until it's done)
//   hint, full:    the text under "Photos", and when there's no more room
//   error:         a problem with the photos, from checking the form
//   ref:           { cancelCrop() }: closes the crop screen if it's open
//                  (true if it was), for Escape
function PhotosField({ photos, onChange, uploadTo, uploadedHere, uploading, onUploadingChange, hint, full, error, ref }) {
    // Which photo's ⋮ menu is open (its index), or null
    const [photoMenu, setPhotoMenu] = useState(null);
    // Chosen photos waiting to be cropped: { files, index } (the one showing)
    const [cropQueue, setCropQueue] = useState(null);
    const [uploadProblem, setUploadProblem] = useState(null);

    useImperativeHandle(ref, () => ({
        cancelCrop() {
            if (!cropQueue) return false;
            setCropQueue(null);
            return true;
        },
    }));

    // Photos still allowed, up to MAX_PHOTOS
    const spaceLeft = Math.max(0, MAX_PHOTOS - photos.length);
    const photosFull = spaceLeft === 0;

    // Focus a photo's ⋮ button after the list changes (1 = first photo)
    const focusPhotoOptions = (number) =>
        requestAnimationFrame(() =>
            document.getElementById(`MonkeyForm-photoOptions-${number}`)?.focus()
        );

    function removePhoto(index) {
        setPhotoMenu(null);
        onChange((list) => list.filter((_, i) => i !== index));
        // Focus the next photo's ⋮ (or the one before, if this was the last)
        const left = photos.length - 1;
        if (left > 0) focusPhotoOptions(Math.min(index, left - 1) + 1);
    }
    // The primary photo goes first: it's the card photo and the first one shown
    function makePrimary(index) {
        setPhotoMenu(null);
        onChange((list) => [list[index], ...list.filter((_, i) => i !== index)]);
        // The chosen photo is now first: focus its ⋮
        focusPhotoOptions(1);
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
        onUploadingChange(true);
        setUploadProblem(null);
        try {
            const url = await uploadPhoto(blob, uploadTo());
            uploadedHere.current.push(url);
            onChange((list) => [...list, url]);
        } catch (problem) {
            setUploadProblem(problem.message);
            onUploadingChange(false);
            return; // don't carry on with the rest if one failed
        }
        onUploadingChange(false);
        nextPhoto(queue);
    }

    const cropFile = cropQueue?.files[cropQueue.index];

    return (
        <>
            <fieldset className="MonkeyForm-photos">
                <legend>Photos</legend>
                <p className="MonkeyForm-hint">{hint}</p>
                {photos.map((url, i) => (
                    <div className="MonkeyForm-photo" key={i}>
                        {/* Small preview, to check it's the right photo; a
                            star marks the primary photo */}
                        <span className="MonkeyForm-preview">
                            <img src={url} alt={`Photo ${i + 1}`} />
                            {i === 0 && (
                                <span className="MonkeyForm-primaryStar" title="Primary photo">
                                    <IconStarFilled size={12} aria-hidden="true" />
                                </span>
                            )}
                        </span>
                        <span className="MonkeyForm-photoLabel" aria-hidden="true">
                            {i === 0 ? "Primary photo" : `Photo ${i + 1}`}
                        </span>
                        <PhotoOptions
                            number={i + 1}
                            isPrimary={i === 0}
                            open={photoMenu === i}
                            onOpen={() => setPhotoMenu(i)}
                            onClose={() => setPhotoMenu(null)}
                            onMakePrimary={() => makePrimary(i)}
                            onDelete={() => removePhoto(i)}
                        />
                    </div>
                ))}
                {error && (
                    <span className="MonkeyForm-fieldError" role="alert">{error}</span>
                )}
                {uploadProblem && (
                    <span className="MonkeyForm-fieldError" role="alert">{uploadProblem}</span>
                )}
                <p className="MonkeyForm-uploading" role="status">
                    {uploading && "Uploading photo…"}
                </p>
                {photosFull && <p className="MonkeyForm-hint MonkeyForm-full">{full}</p>}
                <div className="MonkeyForm-photoButtons">
                    {/* A label styled as a button: opens the phone's camera /
                        photo library, or a file picker */}
                    <label
                        className={
                            uploading || photosFull ? "MonkeyForm-addPhoto is-disabled" : "MonkeyForm-addPhoto"
                        }
                    >
                        <IconUpload size={18} aria-hidden="true" /> Upload new photo
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="visually-hidden"
                            onChange={handleFiles}
                            disabled={uploading || photosFull}
                        />
                    </label>
                </div>
            </fieldset>

            {/* Framing a chosen photo (5:4) before it uploads (on the page
                itself, so it covers the whole screen, not just the form) */}
            {cropFile && createPortal(
                <PhotoCropper
                    key={cropQueue.index}
                    file={cropFile}
                    position={
                        cropQueue.files.length > 1 ? `Photo ${cropQueue.index + 1} of ${cropQueue.files.length}` : null
                    }
                    onUse={handleCropped}
                    onCancel={() => nextPhoto(cropQueue)}
                />,
                document.body
            )}
        </>
    );
}

export default PhotosField;
