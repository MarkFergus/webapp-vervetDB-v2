// The edit / add monkey form's data: filling it in from a monkey, and
// tidying and checking what's been typed before saving. The checks match the
// database's rules (supabase/schema.sql), so problems are explained here in
// plain words instead of being refused by the database.

// Shown on cards when a monkey has no photo yet
export const PLACEHOLDER_PHOTO = "https://i.ibb.co/2YvYtBJ/blank-image-min.jpg";

// The most photos one monkey can have
export const MAX_PHOTOS = 5;

const isPlaceholder = (url) => url === PLACEHOLDER_PHOTO;

// Where a monkey lives, in the form: troop = the Enclosure box's choice (the
// troop whose enclosure it's in or beside, or "enclosure:<id>" for a special
// enclosure such as Quarantine), location = "troop" (with that troop) or an
// introcage's id as text (the Location box; a special enclosure has no troop,
// so always one of its cages). choices: see placeChoices in enclosures.js.

// A monkey (as used on the site) → what the form's boxes start with
export function formFromMonkey(monkey, choices = []) {
    // Introcage monkeys have no troop: the troop of their enclosure
    const troop = monkey.introcage
        ? choices.find((c) => c.enclosure === monkey.enclosure)?.key ?? ""
        : monkey.troop ?? "";
    return {
        name: monkey.name,
        troop,
        location: monkey.introcage ? String(monkey.introcageId ?? "") : troop && "troop",
        // undefined: the database has no introcages yet (so it isn't saved)
        introcageId: monkey.introcageId,
        sex: monkey.sex ?? "",
        year: monkey.year === "" ? "" : String(monkey.year),
        // A chip of null means "unknown" (an empty chip means "no chip")
        chip: String(monkey.chip ?? ""),
        chipUnknown: monkey.chip === null,
        // The placeholder isn't a real photo, so it isn't listed for editing
        photos: monkey.img.filter((url) => !isPlaceholder(url)),
        bio: monkey.bio ?? "",
        desc: monkey.desc ?? "",
    };
}

// An empty form for adding a monkey (with its troop, if one's given)
export function emptyForm(troop = "") {
    return {
        name: "", troop, location: troop && "troop", sex: "", year: "", chip: "", chipUnknown: false,
        photos: [], bio: "", desc: "",
    };
}

// The introcage chosen in the form ({ id, name }), or null
export function chosenIntrocage(form, choices) {
    if (!form.location || form.location === "troop") return null;
    const choice = choices.find((c) => c.key === form.troop);
    return choice?.introcages.find((i) => String(i.id) === form.location) ?? null;
}

// Spaces at the ends removed, runs of spaces made single
const tidy = (text) => text.trim().replace(/ {2,}/g, " ");

// "1011,1604", "1011.1604", "1011 1604", "1011 & 1604" → "1011 & 1604"
function tidyChip(chip) {
    const text = chip.trim();
    if (text === "") return { chip: "" };
    // Allowed: digits, plus spaces , . - & / + or "and" between two numbers
    // (phone number pads have no space key, but have , or .)
    if (/[^\d\s,.\-&/+]/.test(text.replace(/and/gi, " "))) {
        return { error: "Chip numbers can only contain digits." };
    }
    const numbers = text.match(/\d+/g) ?? [];
    if (numbers.length === 0) return { error: "Chip numbers can only contain digits." };
    if (numbers.length > 2) return { error: "At most two chip numbers." };
    return { chip: numbers.join(" & ") };
}

// Tidies and checks the form.
// Returns { errors } (field → message, empty if all fine) and { values }: the
// monkey ready to save, in the site's shape (name, troop or introcage +
// introcageId, sex, year, chip, img, bio, desc).
export function checkForm(form, choices, thisYear = new Date().getFullYear()) {
    const errors = {};

    const name = tidy(form.name);
    if (!name) errors.name = "Please enter a name.";

    const introcage = chosenIntrocage(form, choices);
    const choice = choices.find((c) => c.key === form.troop);
    if (!choice) {
        errors.troop = "Please choose an enclosure.";
    } else if ((form.location !== "troop" || choice.special) && !introcage) {
        // (a special enclosure: one of its cages)
        errors.location = "Please choose a location.";
    }

    const sex = ["male", "female", ""].includes(form.sex) ? form.sex : "";

    let year = "";
    const yearText = form.year.trim();
    if (yearText) {
        year = Number(yearText);
        if (!/^\d{4}$/.test(yearText) || year < 1980 || year > thisYear) {
            errors.year = `Birth year should be between 1980 and ${thisYear}, or left blank if unknown.`;
        }
    }

    // Unknown chip: saved as null, whatever's in the box
    const chipResult = form.chipUnknown ? { chip: null } : tidyChip(form.chip);
    if (chipResult.error) errors.chip = chipResult.error;

    const photos = form.photos.map((url) => url.trim()).filter(Boolean);
    const badPhoto = photos.findIndex((url) => !/^https:\/\/\S+$/.test(url));
    if (badPhoto !== -1) {
        errors.photos = `Photo link ${badPhoto + 1} should be a web address starting with https://`;
    } else if (photos.length > MAX_PHOTOS) {
        errors.photos = `${MAX_PHOTOS} photos is the most a monkey can have. Please remove ${
            photos.length - MAX_PHOTOS === 1 ? "one" : photos.length - MAX_PHOTOS
        }.`;
    }

    return {
        errors,
        values: {
            name,
            // In an introcage: not in the troop
            troop: introcage ? null : form.troop,
            introcage: introcage?.name ?? null,
            // Back with the troop: no introcage (left out if the database
            // has no introcages, or for a new troop monkey)
            introcageId: introcage ? introcage.id : form.introcageId === undefined ? undefined : null,
            sex,
            year,
            chip: chipResult.error ? "" : chipResult.chip,
            // No photos yet: use the placeholder, like the other new monkeys
            img: photos.length ? photos : [PLACEHOLDER_PHOTO],
            bio: tidy(form.bio),
            desc: tidy(form.desc),
        },
    };
}
