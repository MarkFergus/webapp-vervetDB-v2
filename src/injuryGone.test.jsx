// An injury (or update) edited while someone else deleted it: says so, and
// Close takes it off the list instead of trying again
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InjuryForm } from "./Injuries";

const gone = () => Object.assign(new Error("This injury was deleted by someone else."), { gone: true });

test("deleted by someone else: the message, then only Close (onGone)", async () => {
    const user = userEvent.setup();
    const onGone = vi.fn();
    const onCancel = vi.fn();
    render(
        <InjuryForm
            initial={{ date: "2026-11-13", description: "Thinner on the waist" }}
            onSave={async () => {
                throw gone();
            }}
            onCancel={onCancel}
            onGone={onGone}
        />
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This injury was deleted by someone else.");
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onGone).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
});

test("any other problem: Confirm and Cancel stay", async () => {
    const user = userEvent.setup();
    render(
        <InjuryForm
            initial={{ date: "2026-11-13", description: "x" }}
            onSave={async () => {
                throw new Error("The database didn't allow this change. Are you still signed in as an editor?");
            }}
            onCancel={() => {}}
        />
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("didn't allow");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
});

test("a new one with Add Photos: the photos go with it; editing has no Add Photos", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const { unmount } = render(<InjuryForm withPhotos initial={{ date: "2026-11-14", description: "" }} onSave={onSave} onCancel={() => {}} />);
    const photo = new File(["x"], "bite.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Photos"), { target: { files: [photo] } });
    expect(screen.getByRole("list", { name: "Photos chosen" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "Bite on tail");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onSave).toHaveBeenCalledWith({ date: "2026-11-14", description: "Bite on tail", photos: [photo] });
    unmount();
    render(<InjuryForm initial={{ date: "2026-11-14", description: "x" }} onSave={onSave} onCancel={() => {}} />);
    expect(screen.queryByRole("button", { name: "Add Photos" })).toBeNull();
});
