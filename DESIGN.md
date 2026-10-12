---
name: vervetDB
description: The Vervet Monkey Foundation's monkey database, played straight as a dark media app.
colors:
  accent: "#3ea6ff"
  accent-2: "#8cc9ff"
  green: "#3ecf8e"
  green-2: "#6bdba8"
  on-green: "#121212"
  pink: "#fe39a4"
  pink-2: "#ff6dbb"
  danger: "#ff4e45"
  danger-2: "#ff8a80"
  new-arrival-orange: "#ff7a1a"
  sickbay-amber: "#f5b83d"
  bg: "#121212"
  surface-1: "#1e1e1e"
  surface-2: "#292929"
  surface-3: "#414141"
  field: "#151515"
  line: "#323232"
  line-strong: "#4d4d4d"
  text: "#f1f1f1"
  text-2: "#aaaaaa"
  text-3: "#8c8c8c"
typography:
  display:
    fontFamily: "Russo One, Roboto, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  headline:
    fontFamily: "Russo One, Roboto, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.2
  title:
    fontFamily: "Russo One, Roboto, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.15
  body:
    fontFamily: "Roboto, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.3
  body-input:
    fontFamily: "Roboto, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.2
  button:
    fontFamily: "Roboto, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.2
  label:
    fontFamily: "Roboto, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "1px"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  thumb: "12px"
  panel: "14px"
  sheet: "16px"
  full: "999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  chip-hover:
    backgroundColor: "{colors.surface-3}"
  chip-selected:
    backgroundColor: "{colors.text}"
    textColor: "{colors.bg}"
  button-go:
    backgroundColor: "{colors.green}"
    textColor: "{colors.on-green}"
    rounded: "{rounded.md}"
    padding: "6px 14px"
  button-go-hover:
    backgroundColor: "{colors.green-2}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "6px 14px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    rounded: "{rounded.md}"
    padding: "6px 14px"
  button-accent-hover:
    backgroundColor: "{colors.accent-2}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.full}"
    size: "40px"
  search-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    typography: "{typography.body-input}"
    rounded: "{rounded.full}"
    height: "40px"
  card-thumbnail:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.thumb}"
  badge-new-arrival:
    backgroundColor: "{colors.new-arrival-orange}"
    textColor: "{colors.bg}"
    rounded: "{rounded.xs}"
    padding: "2px 7px"
  badge-sickbay:
    backgroundColor: "{colors.sickbay-amber}"
    textColor: "{colors.bg}"
    rounded: "{rounded.xs}"
    padding: "2px 7px"
  panel:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.panel}"
    padding: "16px"
  menu:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.lg}"
    padding: "4px"
---

# Design System: vervetDB

## Overview

**Creative North Star: "The Sanctuary Channel"**

vervetDB is the category standard played straight: a first-class dark media app at YouTube and Supabase-dashboard craft, where the "videos" are monkeys. Faces lead. A near-black page carries a grid of rounded 5:4 photos with each monkey's name set on its own photo in Russo One, a quiet grey line of details below, and one row of soft chips above for narrowing the list. Chrome is small, precise and recessive so the photos do the talking.

The system is dark only (`color-scheme: dark`), tonal rather than lined, and strictly tokenised: every colour comes from the `:root` set in `src/index.css`. One sky-blue accent handles links, focus and the active state of a few controls; selection in chips is white-fill, as on YouTube. Green, pink and two warm status colours each own exactly one job, so colour on screen always means something. Density is media-app density: 36px chips, 40px icon buttons, tight caption lines, generous photo area.

It is minimal and uncluttered by owner direction: no decoration that does not carry information, one badge per card at most, and labels in plain Title Case words. The owner has rejected coloured sex icons and a "Photo Needed" badge; both are recorded as Don'ts below.

**Key Characteristics:**
- Near-black ground (#121212) with three surface steps; depth by tone, shadows only on things that float.
- One interactive accent (sky blue); white-fill for chosen chips.
- Russo One for names, panel titles and the wordmark; Roboto for every piece of chrome.
- 5:4 photo frame everywhere a monkey appears, with the name on a dark fade at the photo's foot.
- Phone-first: sticky blurred top bar, one toolbar row, two-up grid, 60px bottom bar; computers get a 72px YouTube-style rail (icons with small labels) that the top bar ☰ opens out to full labels.

## Colors

A YouTube-dark neutral ladder with one cool accent and a few single-purpose signal colours.

### Primary
- **Sky Signal Blue** (accent): the only interactive accent. Focus rings (2px solid, offset 2px), the search field's focus border, links, the logo mark, "Show More" outline, the empty-state Clear All button, Back to Top on hover, the caret and text selection. Its lighter partner (accent-2) is the hover state.

### Secondary
- **Go Green** (green): "go" actions only: Add Photos (the staff bottom-bar centre circle), Save, the Filters panel's Show button, and the signed-in account icon (green ring with a 15% green wash). Text and icons on it use on-green (near-black). green-2 is its hover.
- **Pop-up Pink** (pink): destructive and cancel actions inside pop-ups (Delete, Discard). pink-2 is its hover.

### Tertiary
- **New Arrival Orange** (new-arrival-orange): the New Arrival badge on cards and rows, and its status in the pop-up. Nothing else.
- **Sickbay Amber** (sickbay-amber): the In Sickbay badge and status. Nothing else.
- **Alert Red** (danger / danger-2): errors and failed validation text, never an action fill on the main page.

### Neutral
- **Page Black** (bg): the page, the side rail at rest, the drawer, and text on white or coloured fills.
- **Panel Charcoal** (surface-1): bars, the Filters panel, pop-ups.
- **Chip Graphite** (surface-2): anything raised and tappable: chips, the count, the view switch track, the Sort menu, the photo placeholder, row hover.
- **Hover Graphite** (surface-3): raised things on hover; also the scrollbar thumb.
- **Field Black** (field): the search box only.
- **Hairline** (line) and **Hairline Strong** (line-strong): dividers, group outlines, panel and menu borders, outlines on hover.
- **Paper White** (text): primary text and the white chosen-chip fill.
- **Caption Grey** (text-2): details lines, section headings, chevrons, bottom-bar labels.
- **Quiet Grey** (text-3): placeholders, hints, table headings, row details; still AA on every surface.

### Named Rules
**The Token-Only Rule.** Every colour is a `var(--…)` from `:root` in `src/index.css`; a raw hex in a component stylesheet is a defect, not a choice.

**The One Job Rule.** Blue is interaction, green is go, pink is destroy-or-cancel in a pop-up, orange is New Arrival, amber is In Sickbay. A colour borrowed for a second job stops meaning either.

**The White Chip Rule.** A chosen chip, pill or view button turns Paper White with Page Black text. Blue is never the selected fill.

## Typography

**Display Font:** Russo One (with Roboto, system-ui)
**Body Font:** Roboto (with system-ui, -apple-system, Segoe UI, sans-serif)

**Character:** Russo One's squared, sporty caps give each monkey's name the weight of a channel title; Roboto keeps all chrome neutral and legible in sunlight. The two never swap roles.

### Hierarchy
- **Display** (Russo One 400, 24px, 1): the "vervetDB" wordmark in the top bar (computers 870px and up); 20px in the phone drawer.
- **Headline** (Russo One 400, 18px): panel titles such as "Filters"; the empty-state heading uses Roboto bold 18px.
- **Title** (Russo One 400, 17px, 1.15; 15px on phones): the monkey's name on its photo, white, one line with ellipsis. Rows use 15px. Group titles inside the Filters panel use 14px.
- **Body** (Roboto 400, 14px, 1.3): card details line (13px on phones), list rows, menu items (15px), drawer items (15px).
- **Body Input** (Roboto 400, 16px): the search field and any text entry on phones, so iOS does not zoom.
- **Button** (Roboto 500, 14px): chips and toolbar buttons; action buttons (Show, Clear All, + Add) use 700.
- **Label** (Roboto 700, 12px, 1px tracking, uppercase): side rail and drawer group headings, Filters section labels, list table column headings. Functional headings only.

### Named Rules
**The Name Voice Rule.** Russo One is reserved for monkey names, panel titles and the wordmark. Buttons, chips, details and labels are always Roboto.

**The Title Case Rule.** Every button label is Title Case ("Clear All", "Add Photos", "Show More"). Places are written in full on screen ("Dino & Daniel", "Holt & Barrington"); the short forms ("D&D", "H&B") appear only on cards and rows, and a long place name breaks after the "&".

## Layout

Phone-first, with two breakpoints that matter: **625px** (gutters grow from 12px to 24px; the grid switches from fixed two-up to auto-fill) and **690px** (phone top bar, bottom bar and drawer give way to the computer top bar and side rail). The wordmark appears at **870px**; the opened rail pushes the page over at **960px**.

- **Top bar:** sticky, 8px vertical padding around a 40px search pill (57px total), on Page Black at 90% with a 12px backdrop blur. A faint 8%-white hairline appears under it once the page scrolls. On computers it becomes a three-column grid with the search centred (240px to 540px).
- **Toolbar:** one row of 36px controls (Filters, Sort, count, then the grid/list switch pushed right). Gaps tighten from 10px to 4px as the phone narrows; at the tightest widths Filters and then Sort collapse to icons rather than wrap.
- **Grid:** phones two columns, 20px row gap, 10px column gap, 12px gutters. Wider: `repeat(auto-fill, minmax(min(240px, 50% - 8px), 1fr))`, 24px row gap, 16px column gap, 24px gutters (16px from the rail on computers). Same card size as the Enclosures page.
- **List view:** centred table at most 940px wide; 56px thumbnail column, name, troop, sex, born, age, chip. Born drops below 900px. On phones each row is photo, name with a details line, chip.
- **Side rail (computers):** 72px, icons with small labels under them; the top bar ☰ opens it out to 228px with full labels in groups (it does not react to hover).
- **Bottom bar (phones):** five equal tabs, 60px plus the safe-area inset, blurred Page Black at 94%. The centre slot is Add Photos for staff.
- **Spacing rhythm:** 4 / 6 / 8 / 12 / 16 / 24px. Page gutters are 12px on phones and 24px wider; nothing else sets the edge.

### Named Rules
**The One Row Rule.** The toolbar stays on a single line at every width down to 320px; controls shrink to icons before anything wraps or scrolls.

**The Same Size Rule.** Controls keep their height as the screen narrows (36px chips, 40px icon buttons, 32px chosen-filter chips); only padding and gaps tighten.

## Elevation & Depth

Depth is tonal. Surfaces step up from Page Black through Panel Charcoal and Chip Graphite to Hover Graphite, and borders are 1px hairlines. Shadows appear only on things that float over the page: menus, the Filters panel, the side rail when it opens over content, the drawer, Back to Top, and the Add Photos circle. Sticky bars use translucency and blur rather than shadow.

### Shadow Vocabulary
- **Menu** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5)`): Sort menu, Coming Soon toast.
- **Panel** (`box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6)`): the Filters drop-down.
- **Side sheet** (`box-shadow: 8px 0 24px rgba(0, 0, 0, 0.5)`, mirrored for the drawer; `12px 0 32px rgba(0, 0, 0, 0.55)` for the hover rail): anything sliding over the page from an edge.
- **Floating button** (`box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5)`): Back to Top; Add Photos adds a 25% green glow beneath.
- **Scrim** (`rgba(0, 0, 0, 0.5–0.6)`): behind the drawer, the phone filter sheet and the over-page rail.

### Named Rules
**The Float-Only Shadow Rule.** A surface at rest in the page flow has no shadow. If it doesn't sit over other content, it doesn't cast.

## Shapes

Soft, consistent rounding with no sharp corners and no oversized pills except where YouTube uses them. Photos are 12px; tappable rectangles (chips, buttons, inputs) are 8px; inner parts of a control (view-switch buttons, menu items) step down to 6px; badges are 4px. Menus and grouped boxes take 10px, the Filters panel 14px, and the phone bottom sheet 16px on its top corners only. The search field, + Add and the Coming Soon toast are full pills; icon buttons, the account avatar, Back to Top and Add Photos are circles. Every monkey photo is a 5:4 frame, filled by `object-fit: cover`.

### Named Rules
**The 5:4 Frame Rule.** A monkey photo is always shown in a 5:4 frame, whatever its source shape, so the grid can never be upset by one odd photo.

## Components

### Buttons
Calm and compact; only "go" and empty-state recovery get a filled colour.
- **Shape:** gently rounded (8px).
- **Go (the Filters panel's Show button, Save):** Go Green fill, near-black text, Roboto 700 14px, 6px 14px padding; hover lifts to green-2.
- **Outline (Clear All):** transparent with a Hairline Strong border; hover brightens text and border to white.
- **Accent (empty-state Clear All):** Sky Signal Blue fill, Page Black text; hover accent-2.
- **Soft pill (+ Add):** 10% white wash, 999px radius, 36px tall; hover 16%.
- **Icon buttons (☰, account, close):** 40px circles, transparent; hover 10% white wash.
- **Focus:** 2px solid accent outline, offset 0–2px depending on room. Disabled is 40–60% opacity.
- **Tap targets:** 36px chips extend their hit area to 44px with an invisible pseudo-element.

### Chips
- **Style:** Chip Graphite fill, no border, 8px radius, 36px tall, Roboto 500 14px, an icon first and a quiet chevron last when it opens something.
- **States:** hover and open go to Hover Graphite. Active (filters in use) turns Paper White with Page Black text and a small inverse count bubble. The count chip is display-only, its number in Caption Grey.
- **Chosen-filter chips:** 32px tall under the toolbar; tapping one removes it; an outlined 32px "filters off" icon clears them all.
- **Filter pills (in the panel):** a three-up grid of equal pills; "All" is dashed and unfilled; chosen is white-fill.

### Cards / Containers
- **Monkey card:** a full-card button. 5:4 photo, 12px radius, Chip Graphite placeholder. A bottom 60% gradient to 85% black carries the name in white Russo One. Under the photo, one line of details in Caption Grey, always **troop · sex · age** in the same grey, separated by middle dots; when short of room the troop ellipsises first, then "Male/Female" drops to its icon, then "Age unknown" becomes "Age ?". Hover/focus scales the photo 1.06 over 0.5s and brightens it slightly; focus draws the accent ring around the photo, not the card.
- **One badge:** top-left of the photo, 4px radius, 12px bold, near-black on its status colour: New Arrival (orange) beats In Sickbay (amber); never both on a card.
- **No photo:** the grey frame with a quiet 36px photo outline icon in Quiet Grey; no badge.
- **Panels:** Filters is Panel Charcoal, 14px radius, Hairline Strong border, 16px padding, Panel shadow, sticky footer; on phones it becomes a bottom sheet.

### Inputs / Fields
- **Search:** Field Black pill, 1px Hairline border, 40px tall, 16px text, Quiet Grey placeholder. Hover: Hairline Strong border. Focus: accent border plus a 1px accent ring.
- **Selects:** Page Black fill, Hairline Strong border, 8px radius, 15px text; focus turns the border accent. An unchosen select shows Quiet Grey text.

### Navigation
- **Side rail (computers):** 72px of 24px icons with 12px labels under them on Page Black. ☰ opens it out to 228px: icon and label side by side, in Browse / Tools / App groups. Hover 8% white; the current page is bold with a white icon.
- **Bottom bar (phones):** five tabs with 12px labels in Caption Grey; the current tab is bold white. For staff the centre is a 48px Go Green circle (Add Photos) with a soft glow; it presses to 0.94 scale.
- **Drawer (phones, from the right):** Page Black, min(300px, 85vw), grouped items 15px with uppercase group labels and hairline separators.
- **Account:** a person in a 30px ring; green ring and 15% green wash when signed in. Hover labels are small dark rounded tooltips after a 0.4s pause.

### Sort Menu
Drops 6px under its chip: Chip Graphite, Hairline Strong border, 10px radius, Menu shadow, 4px padding. Items are 15px with the direction ("A–Z", "Oldest first") faded beside the name in Quiet Grey; hover or keyboard focus fills with Hairline.

## Do's and Don'ts

### Do:
- **Do** take every colour from the `:root` tokens in `src/index.css`.
- **Do** keep the card details line in the order troop · sex · age, all in Caption Grey (#aaaaaa).
- **Do** show at most one badge per card: New Arrival over In Sickbay.
- **Do** use white-fill (Paper White, Page Black text) for chosen chips, pills and view buttons.
- **Do** write button labels in Title Case and places in full on screen ("Dino & Daniel"); short forms only on cards and rows.
- **Do** keep controls at 36px (chips) and 40px (icon buttons) at every width, extending tap areas to 44px.
- **Do** honour `prefers-reduced-motion`: every slide, scale and fade has a no-motion fallback.
- **Do** show a monkey photo in the 5:4 frame with the name on the photo's dark fade.

### Don't:
- **Don't** put a raw hex in a component stylesheet.
- **Don't** colour the sex icons; ♂ and ♀ inherit the grey of the details line.
- **Don't** add a "Photo Needed" badge; a no-photo tile shows only a quiet photo icon.
- **Don't** stack badges on a card or add decoration that carries no information.
- **Don't** use blue as a selected fill, or green, pink, orange or amber for anything outside their one job.
- **Don't** set buttons, chips or details in Russo One.
- **Don't** add shadows to surfaces at rest in the page flow.
- **Don't** let the toolbar wrap onto a second line.
