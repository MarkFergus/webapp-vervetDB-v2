// Phones: the keyboard covers the bottom of the screen (index.html's
// interactive-widget), and the browser doesn't always move the box being typed
// in out from under it. So, whenever a box gets the focus or the keyboard opens,
// anything that's hidden is scrolled up into the space left above the keyboard.
// For the whole app: nothing to add to each form. It only moves things then, so
// it never fights someone scrolling while typing.

// Less height than the screen by this much: the keyboard's open (not just the
// browser's address bar sliding away)
const KEYBOARD_MIN = 120;
// Room left around the box
const MARGIN = 12;
const NOT_TYPED_IN = /^(button|checkbox|color|date|datetime-local|file|hidden|image|month|radio|range|reset|submit|time|week)$/;

export const isTextField = (el) =>
    Boolean(el) &&
    (el.tagName === "TEXTAREA" || el.isContentEditable === true || (el.tagName === "INPUT" && !NOT_TYPED_IN.test(el.type)));

// The boxes' scrolling parents, nearest first
function scrollersOf(el) {
    const found = [];
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(p).overflowY)) found.push(p);
    }
    return found;
}

// The bars stuck to the top of the page
function navHeight() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-height")) || 0;
}

// How far to scroll so the box shows between the top bars and the keyboard
// (a box too tall for the space: its top)
export function scrollNeeded(rect, viewport, top = 0) {
    const first = viewport.offsetTop + top + MARGIN;
    const last = viewport.offsetTop + viewport.height - MARGIN;
    if (rect.top < first) return rect.top - first;
    if (rect.bottom > last) return Math.min(rect.bottom - last, rect.top - first);
    return 0;
}

export function keepFieldVisible(viewport = window.visualViewport) {
    if (!viewport) return () => {};
    let fullHeight = viewport.height;
    let width = viewport.width;
    let lastHeight = viewport.height;
    // (room added under what's being scrolled, so even the last box on a page
    // can rise above the keyboard: taken off as the keyboard closes)
    const padded = new Map();

    const addRoom = (el, keyboard) => {
        if (!padded.has(el)) padded.set(el, el.style.paddingBottom);
        el.style.paddingBottom = `${keyboard}px`;
    };
    const removeRoom = () => {
        for (const [el, before] of padded) el.style.paddingBottom = before;
        padded.clear();
    };

    function reveal() {
        const field = document.activeElement;
        const keyboard = fullHeight - viewport.height;
        if (!isTextField(field) || keyboard < KEYBOARD_MIN) return;
        let left = scrollNeeded(field.getBoundingClientRect(), viewport, navHeight());
        if (!left) return;
        const scrollers = scrollersOf(field);
        for (const el of [...scrollers, document.body]) addRoom(el, keyboard);
        for (const el of scrollers) {
            const before = el.scrollTop;
            el.scrollTop = before + left;
            left -= el.scrollTop - before;
            if (Math.abs(left) < 1) return;
        }
        window.scrollBy(0, left);
    }

    function onResize() {
        if (viewport.width !== width) {
            // (turned sideways: a new full height)
            width = viewport.width;
            fullHeight = viewport.height;
            removeRoom();
        }
        const shrinking = viewport.height < lastHeight;
        lastHeight = viewport.height;
        fullHeight = Math.max(fullHeight, viewport.height);
        if (fullHeight - viewport.height < KEYBOARD_MIN) removeRoom();
        else if (shrinking) reveal();
    }

    document.addEventListener("focusin", reveal);
    viewport.addEventListener("resize", onResize);
    return () => {
        document.removeEventListener("focusin", reveal);
        viewport.removeEventListener("resize", onResize);
        removeRoom();
    };
}
