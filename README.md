# vervetDB

A visual interface for the Vervet Monkey Foundation monkey database: search, filter and browse every monkey, view their photos and details, and create printable profile books (PDF) for a troop.

**Live site:** https://markfergus.github.io/webapp-vervetDB-v2/

Built with React 19 and Vite. Tests use Vitest.

---

## Getting started

You need [Node.js](https://nodejs.org) (the LTS version) and Git.

```
npm install     # once, and again whenever package.json changes
npm start       # runs the app at http://localhost:3000/webapp-vervetDB-v2/
```

Press **Ctrl+C** in the terminal to stop it.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Runs the app locally; changes appear as you save |
| `npm test` | Runs the tests and re-runs them as you save (press **q** to quit) |
| `npx vitest run` | Runs all the tests once — do this before committing |
| `npm run build` | Builds the site into `dist/` (the deploy does this for you) |
| `npm run preview` | Serves the built `dist/` locally, to check a build |

## Adding or editing a monkey

All monkey data lives in [`src/monkeysArr.js`](src/monkeysArr.js). Each monkey looks like this:

```js
{
    name: "Aroha",
    sex: "male",            // "male", "female", or "" if unknown
    chip: 19806,            // a number (no quotes); "" if no chip; "1011 & 1604" for two chips
    troop: "James",         // must match a troop in src/groupsArr.js
    year: 2016,             // birth year as a number (no quotes); "" if unknown
    img: [                  // one or more photo links, first one is the card photo
        "https://i.ibb.co/smzxJ28/aroha-james-oct2023-min.webp",
    ],
    bio: "Arrived as an orphan in 2016.",
    desc: "Distinctive features and behaviours (optional).",
},
```

**Photos** are hosted on [ImgBB](https://imgbb.com). Upload the photo, then copy its direct link (starting `https://i.ibb.co/`). WebP files are fine — they're converted automatically when making a PDF.

**After editing, run `npx vitest run`.** The data tests check every monkey and will name any entry with a problem, for example a misspelt field, a year in quotes, a troop that isn't in the filter, or a stray space at the end of a name.

Unknown values show as "Unknown" (or "?" on the cards), and an empty bio shows as "No bio yet."

### Adding a troop

Add the troop's name to [`src/groupsArr.js`](src/groupsArr.js) so it appears in the troop filter. Monkeys in that troop must use exactly the same spelling.

## Daily change emails

Every add, edit and delete of a monkey is recorded in the database (who, when, and what changed). Each day at **18:00 South African time** (16:00 UTC) a summary of the changes since the last one is emailed via [Resend](https://resend.com). Days with no changes send nothing. Set up by [`supabase/change-history.sql`](supabase/change-history.sql).

Run these in **Supabase → SQL Editor → New query**:

| To… | Run |
|---|---|
| Send a review email now (last 7 days; doesn't affect the daily one) | `select private.send_daily_summary(test => true);` |
| Send the real summary now (changes since the last one) | `select private.send_daily_summary();` |
| Check whether emails went (200 = sent; otherwise `content` says why) | `select created, status_code, content from net._http_response order by created desc limit 5;` |
| See the change history | `select changed_at, action, changed_by_email, coalesce(new_row ->> 'name', old_row ->> 'name') as monkey from private.monkey_changes order by changed_at desc limit 50;` |
| Change who gets it | `update private.summary_settings set send_to = array['you@example.com'];` |
| Change the time (UTC, `'minute hour * * *'`) | `select cron.schedule('vervetdb-daily-summary', '0 16 * * *', $$select private.send_daily_summary()$$);` |
| Replace the Resend API key | `select vault.update_secret((select id from vault.secrets where name = 'resend_api_key'), 're_new_key');` |

- Emails come from `onboarding@resend.dev` and can only go to the Resend account's own address (currently `github@accounts.markfergus.com`). To send to anyone else, verify the domain at [resend.com/domains](https://resend.com/domains) and change the sender: `update private.summary_settings set send_from = 'vervetDB <vervetdb@markfergus.com>';`
- Only changes made after the script was run are recorded.
- The history and settings are in a `private` schema that the website can't reach.

## Deploying

The live site updates automatically: **push to `master` and GitHub does the rest.** The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) installs, runs all the tests, builds, and publishes to GitHub Pages. If any test fails, nothing is published.

- Follow progress in the repository's **Actions** tab.
- To redeploy without a new commit: **Actions → Test and deploy → Run workflow**.
- Pushes to other branches run the tests only.

## Making a change (Git routine)

For anything bigger than a small fix, work on a branch so `master` (the live site) stays working:

```
git switch -c my-change          # create a branch and move to it
# ...edit, then check with npm start and npx vitest run...
git add .
git commit -m "Describe the change"
git switch master
git merge my-change
git branch -d my-change          # tidy up the merged branch
git push                         # publishes the site
```

`git status` shows what's changed; `git log --oneline` shows recent commits.

## How it's put together

| File | Purpose |
|---|---|
| `src/ShowPage.jsx` | The main page: search, filters, sorting, the card grid, and PDF creation |
| `src/MonkeyCard.jsx` | One card in the grid |
| `src/Modal.jsx` | The monkey detail pop-up (photos, details, previous/next) |
| `src/Nav.jsx` | Top bar: logo, search box, PDF button |
| `src/ModalPDF.jsx` | The PDF pop-up (count, warning, progress) |
| `src/MonkeyPDF.jsx` | Layout of the PDF profile book (cover page, rows of monkeys) |
| `src/pdfPhotos.js` | Converts photos to JPG for the PDF (the PDF library can't use WebP) |
| `src/useDialog.js` | Keyboard and focus behaviour shared by both pop-ups |
| `src/MonkeyIcon.jsx`, `src/monkeyIconPath.js` | The monkey logo as a vector (used on the site and in the PDF) |
| `src/monkeysArr.js`, `src/groupsArr.js` | The data: monkeys and troops |
| `src/*.test.js(x)` | Tests |

### Notes

- **PDF photos:** the PDF library only supports JPG/PNG, so `pdfPhotos.js` redraws each photo as a JPG in the browser. This relies on ImgBB allowing other sites to read its images (it does). Large PDFs (all troops) download every photo and can take several minutes.
- **The PDF library is loaded only when a PDF is created**, which keeps the site itself quick to load.
- **Keyboard:** Tab through cards, Enter to open, ← / → for previous/next monkey, Escape to close.
