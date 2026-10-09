// Full names for the troops known by their initials (D&D, H&B), and how
// they wrap (PlaceName.jsx)
import { render } from "@testing-library/react";
import { fullName, placeLabel } from "./places";
import PlaceName from "./PlaceName";

test("D&D and H&B (and their introcages) in full; other names as they are", () => {
    expect(fullName("D&D")).toBe("Dino & Daniel");
    expect(fullName("H&B")).toBe("Holt & Barrington");
    expect(fullName("H&B C1")).toBe("Holt & Barrington C1");
    expect(fullName("D&D A1")).toBe("Dino & Daniel A1");
    expect(fullName("Goliath")).toBe("Goliath");
    expect(fullName("Calypso's Corner A")).toBe("Calypso's Corner A");
    expect(fullName("H&Bx")).toBe("H&Bx");
    expect(fullName(null)).toBeNull();
});

test("the pop-up and Profile Book labels use the full names", () => {
    expect(placeLabel({ troop: "D&D", introcage: null })).toBe("Dino & Daniel Troop");
    expect(placeLabel({ troop: null, introcage: "H&B C2" })).toBe("Holt & Barrington C2");
});

test("headings and cards wrap only after the \"&\": \"Dino &\" / \"Daniel A1\"", () => {
    const { container } = render(<h1><PlaceName name="D&D A1" /></h1>);
    expect(container).toHaveTextContent("Dino & Daniel A1");
    expect([...container.querySelectorAll(".nowrap")].map((s) => s.textContent)).toEqual(["Dino &", "Daniel A1"]);
});

test("a suffix stays with the last part; other names aren't split", () => {
    const { container } = render(<p><PlaceName name="H&B" suffix=" Troop" /></p>);
    expect([...container.querySelectorAll(".nowrap")].map((s) => s.textContent)).toEqual(["Holt &", "Barrington Troop"]);
    const { container: other } = render(<p><PlaceName name="Goliath" /></p>);
    expect(other.querySelectorAll(".nowrap")).toHaveLength(0);
    expect(other).toHaveTextContent("Goliath");
});
