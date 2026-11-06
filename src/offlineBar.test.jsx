// With no signal, editors still get to Monitoring from the phone bar
import { render, screen } from "@testing-library/react";
import { BottomBar } from "./NavBars";

test("Records in the middle, Scan and Map beside it, no Add Photos", () => {
    render(<BottomBar page="" onHome={() => {}} onMap={() => {}} onScan={() => {}} recordsCircle />);
    expect(screen.getByRole("link", { name: "Records" })).toHaveAttribute("href", "#records");
    expect(screen.getByRole("button", { name: "Scan QR Code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Interactive Map" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Photos" })).not.toBeInTheDocument();
});
