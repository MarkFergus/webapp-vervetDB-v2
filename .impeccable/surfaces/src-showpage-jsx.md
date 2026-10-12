---
version: 1
slug: "src-showpage-jsx"
primary_target: "src/ShowPage.jsx"
related_targets: ["src/Nav.jsx","src/NavBars.jsx","src/FilterPanel.jsx","src/SortMenu.jsx","src/MonkeyCard.jsx","src/MonkeyRow.jsx"]
---

# Surface brief: main page + app shell (ShowPage, Nav, NavBars, FilterPanel, SortMenu, MonkeyCard, MonkeyRow)

Mode: Operate. Scope: main page and app shell; pop-up and other pages follow later in the same system.
Audience/job: staff on phones (often outdoors) finding a monkey fast; visitors browsing.
Constraints: nothing pinned by the owner; must not feel cluttered, cartoony, corporate, or slower. Title Case buttons; full names on screen.
Chosen: canon (the category standard) at full fidelity; craft bar = YouTube (grid, chips, bottom bar) and the Supabase dashboard (icon rail that expands on hover, small precise icons, account drop-down).

## Direction contract
THESIS: The category standard played straight: vervetDB as a first-class dark media app at YouTube and Supabase-dashboard craft. Refuses the half-built version of that look: hard-coded hexes, three competing neons, uneven control sizes.
OWN-WORLD: Near-black #0f0f0f ground, #212121/#272727 raised surfaces, #f1f1f1 text, #aaaaaa secondary, hairlines #303030. One interactive accent (sky blue) for links, focus and active filters; white-filled chip = selected (YouTube). Pink, green, orange keep single reserved jobs: pink = destructive and cancel actions in the pop-ups (the earlier "female" wording was an authoring error; the owner rejected coloured sex icons), green = Add Photos and Save (plus the signed-in account, per README), orange = New Arrival. Roboto-weight UI sans for chrome, Russo One for names and wordmark. All values as :root tokens.
STORY: Visitor sees faces first, scans names on photos, narrows with chips, opens a monkey in one tap.
FIRST VIEWPORT: Phone: 56px top bar (logo, pill search, account), one toolbar row of 36px chips (Filters, Sort, count, view), two-up 5:4 thumbnails with names on photos, 64px bottom bar with Add Photos centre for staff. Desktop: YouTube-style small rail (72px, icons with small labels); the top bar ☰ toggles it open to full labels (hover expansion tried and removed at the owner's request), same chip row, auto-fill grid.
FORM: canon (the category standard), chosen by the user over the rolled Ear-Tag Roster ("i choose pick 3"); seed: none (canon chosen by the user; no rolled direction was built). Exception kept from product truth: green also marks the signed-in account (README).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
