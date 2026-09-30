// The edit / add monkey form's data: filling it in from a monkey, and
// tidying and checking what's been typed before saving. The checks match the
// database's rules (supabase/schema.sql), so problems are explained here in
// plain words instead of being refused by the database.

// Shown on cards when a monkey has no photo yet
export const PLACEHOLDER_PHOTO = "https://i.ibb.co/2YvYtBJ/blank-image-min.jpg";

const isPlaceholder = (url) => url === PLACEHOLDER_PHOTO;

// A monkey (as used on the site) → what the form's boxes start with
export function formFromMonkey(monkey) {
    return {
        name: monkey.name,
        troop: monkey.troop,
        sex: monkey.sex ?? "",
        year: monkey.year === "" ? "" : String(monkey.year),
        chip: String(monkey.chip ?? ""),
        // The placeholder isn't a real photo, so it isn't listed for editing
        photos: monkey.img.filter((url) => !isPlaceholder(url)),
        bio: monkey.bio ?? "",
        desc: monkey.desc ?? "",
    };
}

// An empty form for adding a monkey
export function emptyForm(troop = "") {
    return { name: "", troop, sex: "", year: "", chip: "", photos: [], bio: "", desc: "" };
}

// Spaces at the ends removed, runs of spaces made single
const tidy = (text) => text.trim().replace(/ {2,}/g, " ");

// "1011 1604", "1011,1604", "1011 & 1604" → "1011 & 1604"
function tidyChip(chip) {
    const text = chip.trim();
    if (text === "") return { chip: "" };
    // Allowed: digits, plus spaces / , & / + / "and" between two numbers
    if (/[^\d\s,&/+]/.test(text.replace(/and/gi, " "))) {
        return { error: "Chip numbers can only contain digits." };
    }
    const numbers = text.match(/\d+/g) ?? [];
    if (numbers.length === 0) return { error: "Chip numbers can only contain digits." };
    if (numbers.length > 2) return { error: "At most two chip numbers." };
    return { chip: numbers.join(" & ") };
}

// Tidies and checks the form.
// Returns { errors } (field → message, empty if all fine) and { values }: the
// monkey ready to save, in the site's shape (name, troop, sex, year, chip,
// img, bio, desc).
export function checkForm(form, troops, thisYear = new Date().getFullYear()) {
    const errors = {};

    const name = tidy(form.name);
    if (!name) errors.name = "Please enter a name.";

    if (!troops.includes(form.troop)) errors.troop = "Please choose a troop.";

    const sex = ["male", "female", ""].includes(form.sex) ? form.sex : "";

    let year = "";
    const yearText = form.year.trim();
    if (yearText) {
        year = Number(yearText);
        if (!/^\d{4}$/.test(yearText) || year < 1980 || year > thisYear) {
            errors.year = `Birth year should be between 1980 and ${thisYear}, or left blank if unknown.`;
        }
    }

    const chipResult = tidyChip(form.chip);
    if (chipResult.error) errors.chip = chipResult.error;

    const photos = form.photos.map((url) => url.trim()).filter(Boolean);
    const badPhoto = photos.findIndex((url) => !/^https:\/\/\S+$/.test(url));
    if (badPhoto !== -1) {
        errors.photos = `Photo link ${badPhoto + 1} should be a web address starting with https://`;
    }

    return {
        errors,
        values: {
            name,
            troop: form.troop,
            sex,
            year,
            chip: chipResult.chip ?? "",
            // No photos yet: use the placeholder, like the other new monkeys
            img: photos.length ? photos : [PLACEHOLDER_PHOTO],
            bio: tidy(form.bio),
            desc: tidy(form.desc),
        },
    };
}
