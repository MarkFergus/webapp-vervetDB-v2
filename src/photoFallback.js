// For an <img>: if its photo can't load (e.g. offline and never viewed),
// show another one instead (e.g. its thumbnail). If that fails too, or there
// is no other photo, `then` runs (if given).
// Give the <img> key={src} so a new photo starts afresh.
export function fallbackTo(otherUrl, then) {
    return (event) => {
        const img = event.currentTarget;
        if (img.dataset.fellBack || img.getAttribute("src") === otherUrl) {
            then?.(event);
            return;
        }
        img.dataset.fellBack = "true";
        img.src = otherUrl;
    };
}
