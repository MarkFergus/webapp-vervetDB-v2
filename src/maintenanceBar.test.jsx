// Maintenance accounts: Records > Maintenance in the middle of the phone bar
import { render, screen } from "@testing-library/react";
import { BottomBar } from "./NavBars";

test("Maintenance in the middle, Scan and Map beside it, Documents in ☰", () => {
    render(<BottomBar page="" onHome={() => {}} onMap={() => {}} onScan={() => {}} onProfileBook={() => {}} maintenanceCircle />);
    expect(screen.getByRole("link", { name: "Maintenance" })).toHaveAttribute("href", "#records/maintenance");
    expect(screen.getByRole("button", { name: "Scan QR Code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Interactive Map" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Documents" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Records" })).not.toBeInTheDocument();
});

test("on the Records page it shows as the current one", () => {
    render(<BottomBar page="records" onHome={() => {}} onMap={() => {}} onScan={() => {}} maintenanceCircle />);
    expect(screen.getByRole("link", { name: "Maintenance" })).toHaveAttribute("aria-current", "page");
});

test("everyone else keeps the map in the middle", () => {
    render(<BottomBar page="" onHome={() => {}} onMap={() => {}} onScan={() => {}} onProfileBook={() => {}} />);
    expect(screen.queryByRole("link", { name: "Maintenance" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Documents" })).toBeInTheDocument();
});
