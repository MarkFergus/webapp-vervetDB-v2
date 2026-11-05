// Phones: a box being typed in is never left behind the keyboard
import { isTextField, keepFieldVisible, scrollNeeded } from "./keepFieldVisible";

const fakeViewport = (height) => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height, width: 400, offsetTop: 0 });
    return viewport;
};
const resize = (viewport, height) => {
    viewport.height = height;
    viewport.dispatchEvent(new Event("resize"));
};
const box = (top, height = 40) => ({ top, bottom: top + height });

describe("scrollNeeded", () => {
    const viewport = { height: 400, offsetTop: 0 };
    test("in the space above the keyboard: nothing", () => {
        expect(scrollNeeded(box(100), viewport)).toBe(0);
    });
    test("hidden by the keyboard: just up far enough", () => {
        expect(scrollNeeded(box(600), viewport)).toBe(252);
    });
    test("under the top bars: down far enough", () => {
        expect(scrollNeeded(box(30), viewport, 56)).toBe(-38);
    });
    test("too tall for the space: its top shows", () => {
        expect(scrollNeeded(box(500, 700), viewport)).toBe(488);
    });
});

test("isTextField: boxes that open a keyboard, not ticks or date pickers", () => {
    const made = (type) => Object.assign(document.createElement("input"), { type });
    expect(isTextField(made("text"))).toBe(true);
    expect(isTextField(made("number"))).toBe(true);
    expect(isTextField(document.createElement("textarea"))).toBe(true);
    expect(isTextField(made("checkbox"))).toBe(false);
    expect(isTextField(made("date"))).toBe(false);
    expect(isTextField(document.createElement("button"))).toBe(false);
});

describe("keepFieldVisible", () => {
    let stop;
    let field;
    beforeEach(() => {
        field = document.createElement("textarea");
        document.body.append(field);
        field.getBoundingClientRect = () => box(600);
        window.scrollBy = vi.fn();
    });
    afterEach(() => {
        stop?.();
        field.remove();
        document.body.style.paddingBottom = "";
    });

    test("focused, then the keyboard opens: the page scrolls, with room to do so; the room goes when it closes", () => {
        const viewport = fakeViewport(800);
        stop = keepFieldVisible(viewport);
        field.focus();
        expect(window.scrollBy).not.toHaveBeenCalled();
        resize(viewport, 400);
        expect(window.scrollBy).toHaveBeenCalledWith(0, 252);
        expect(document.body.style.paddingBottom).toBe("400px");
        resize(viewport, 800);
        expect(document.body.style.paddingBottom).toBe("");
    });

    test("keyboard already open: a newly focused box is brought up straight away", () => {
        const viewport = fakeViewport(800);
        stop = keepFieldVisible(viewport);
        resize(viewport, 400);
        field.focus();
        expect(window.scrollBy).toHaveBeenCalledWith(0, 252);
    });

    test("in a scrolling pop-up: that scrolls first", () => {
        const viewport = fakeViewport(800);
        stop = keepFieldVisible(viewport);
        const scroller = document.createElement("div");
        scroller.style.overflowY = "auto";
        document.body.append(scroller);
        scroller.append(field);
        field.focus();
        resize(viewport, 400);
        expect(scroller.scrollTop).toBe(252);
        expect(window.scrollBy).not.toHaveBeenCalled();
        scroller.remove();
    });

    test("the address bar sliding away, or scrolling while typing: nothing moves", () => {
        const viewport = fakeViewport(800);
        stop = keepFieldVisible(viewport);
        field.focus();
        resize(viewport, 740);
        expect(window.scrollBy).not.toHaveBeenCalled();
        resize(viewport, 400);
        window.scrollBy.mockClear();
        // (height unchanged, and growing back a little: left alone)
        resize(viewport, 400);
        resize(viewport, 420);
        expect(window.scrollBy).not.toHaveBeenCalled();
    });

    test("no visual viewport: does nothing", () => {
        expect(() => keepFieldVisible(null)()).not.toThrow();
    });
});
