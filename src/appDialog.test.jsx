// The app's own pop-up, in place of the browser's confirm() / alert() boxes
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { askConfirm, askDiscard, showNotice } from "./AppDialog";

const ask = (props) => {
    let answer;
    act(() => {
        answer = askConfirm(props);
    });
    return answer;
};

test("Discard (red) answers yes; Keep Editing, which has the focus, answers no", async () => {
    const user = userEvent.setup();
    let answer = ask({ message: "Discard your changes?", confirmLabel: "Discard", cancelLabel: "Keep Editing" });
    const dialog = screen.getByRole("alertdialog", { name: "Discard your changes?" });
    const discard = within(dialog).getByRole("button", { name: "Discard" });
    expect(discard).toHaveClass("is-danger");
    expect(within(dialog).getByRole("button", { name: "Keep Editing" })).toHaveFocus();
    await user.click(discard);
    await expect(answer).resolves.toBe(true);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    answer = ask({ message: "Discard your changes?", confirmLabel: "Discard", cancelLabel: "Keep Editing" });
    await user.click(screen.getByRole("button", { name: "Keep Editing" }));
    await expect(answer).resolves.toBe(false);
});

test("Escape or a tap outside answers no", async () => {
    const user = userEvent.setup();
    let answer = ask({ message: "Leave?", confirmLabel: "Leave", cancelLabel: "Stay" });
    await user.keyboard("{Escape}");
    await expect(answer).resolves.toBe(false);

    answer = ask({ message: "Leave?", confirmLabel: "Leave", cancelLabel: "Stay" });
    await user.pointer({ keys: "[MouseLeft]", target: document.querySelector(".AppDialog") });
    await expect(answer).resolves.toBe(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

test("askDiscard: asking is true while the question is up", async () => {
    const user = userEvent.setup();
    const asking = { current: false };
    let answer;
    act(() => {
        answer = askDiscard(asking);
    });
    expect(asking.current).toBe(true);
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await expect(answer).resolves.toBe(true);
    expect(asking.current).toBe(false);
});

test("a notice: the message and OK", async () => {
    const user = userEvent.setup();
    let done;
    act(() => {
        done = showNotice("Pip was saved, but Named By wasn't.");
    });
    const notice = screen.getByRole("dialog", { name: "Pip was saved, but Named By wasn't." });
    expect(within(notice).getAllByRole("button")).toHaveLength(1);
    await user.click(within(notice).getByRole("button", { name: "OK" }));
    await expect(done).resolves.toBeUndefined();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
