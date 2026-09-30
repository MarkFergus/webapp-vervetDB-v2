# vervetDB

A visual interface for the Vervet Monkey Foundation monkey database: search, filter and browse every monkey, view their photos and details, create printable profile books (PDF) for a troop, and play **Guess The Monkey** to learn their faces. Signed-in editors can add, edit and delete monkeys and upload photos, and get a daily email of the changes.

**Live site:** https://vervetdb.com/

Built with React 19 and Vite. The data lives in [Supabase](https://supabase.com) (database, sign-in and photo storage). Tests use Vitest.

---

## Getting started

You need [Node.js](https://nodejs.org) (the LTS version) and Git.

```
npm install     # once, and again whenever package.json changes
npm start       # runs the app at http://localhost:3000/
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

Monkeys are edited on the website itself. Changes go straight into the database and everyone sees them immediately; no code change or deploy is needed.

1. **Sign in** with the person icon at the top right (on phones: ☰ menu → **Sign In**). Only accounts listed as editors can make changes; the icon turns green once you're signed in.
2. **To add a monkey:** click the **+** (**Add New Monkey**) at the top right (on phones: ☰ menu → **Add New Monkey**).
3. **To edit or delete one:** open the monkey's pop-up and click **Edit** at the bottom left. **Delete** is in the edit form and asks you to confirm.
4. Fill in the form and click **Save** (or **Add monkey**). The form tidies spaces and chip numbers for you (e.g. `1011 1604` becomes `1011 & 1604`) and explains anything it can't accept.

| Field | Notes |
|---|---|
| Name | Required |
| Troop | Required; chosen from the list |
| Sex | Male, female, or blank if unknown |
| Birth year | 1980 up to this year, or blank if unknown |
| Chip | One number, or two for two chips; blank if none |
| Photos | Up to 5; the first is the card photo |
| Bio / Description | Optional |

**Photos:** click **Upload photo** and choose one or more photos. Each one opens in a crop screen: drag and zoom to frame it, then **Use photo**. Every photo is saved at the site's standard shape and size (5:4, 960 × 768), so they all match. You can also paste a link to a photo hosted elsewhere with **Add photo link**. Removing a photo (bin icon) also deletes it from storage once you save. A monkey without photos shows a "no photo yet" picture.

Unknown values show as "Unknown" (or "?" on the cards), and an empty bio shows as "No bio yet."

If the database can't be reached, the site shows a built-in copy of the data (from [`src/monkeysArr.js`](src/monkeysArr.js)) with a notice, and editing is switched off. That copy is a snapshot from before the database and isn't updated by edits.

### Adding an editor

People without an account can click **Request access** on the sign-in screen, which asks them to email mark@vervet.za.org (set in `ACCESS_EMAIL` in [`src/AccountModal.jsx`](src/AccountModal.jsx)). To add them:

In Supabase, go to **Authentication → Users → Add user**, then either:

- **Send invitation**: they get an email, click the link, and choose a password on the site; or
- **Create new user**: enter their email and any long random password, tick **Auto Confirm User**, then tell them to go to the site, click **Sign in → Forgot password?** and choose their own password.

Every account added this way is an editor automatically ([`supabase/new-editors.sql`](supabase/new-editors.sql)). New sign-ups are switched off, so only accounts you add can sign in. Anyone signed in can change their password from the account pop-up (**Change password**).

- **Remove someone:** Authentication → Users → **…** → **Delete user**.
- **Make someone view-only** (they can sign in but not edit):
  `delete from public.editors where user_id = (select id from auth.users where email = 'them@example.com');`
- Supabase's built-in email sender only sends a few emails an hour (invites and password resets together). That's plenty for occasional use; connecting it to Resend with a verified domain removes the limit.

### Adding a troop

There's no screen for this yet: in **Supabase → SQL Editor → New query** (the number sets its place in the troop list):
`insert into public.troops (name, sort_order) values ('New Troop', 16);`

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

**The domain:** GitHub Pages serves the site at **vervetdb.com** (repository **Settings → Pages → Custom domain**, with "Enforce HTTPS" on). The domain's DNS points at GitHub: four `A` records for `@` (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153) and a `CNAME` for `www` → `markfergus.github.io`. The old address, markfergus.github.io/webapp-vervetDB-v2/, redirects to it automatically. If the address ever changes, also update Supabase's **Authentication → URL Configuration** and `site_url` in `private.summary_settings`.

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
| `src/App.jsx` | Loads the data, shows the main page or the game |
| `src/ShowPage.jsx` | The main page: search, filters, sorting, the card grid, and PDF creation |
| `src/MonkeyCard.jsx` | One card in the grid |
| `src/Modal.jsx` | The monkey detail pop-up (photos, details, previous/next, Edit) |
| `src/Nav.jsx` | Top bar: logo, search box, game / PDF / add / sign-in buttons (☰ menu on phones) |
| `src/MonkeyForm.jsx`, `src/monkeyFormChecks.js` | The add / edit form, and its checks |
| `src/PhotoCropper.jsx`, `src/photoUpload.js` | Cropping photos and uploading them to storage |
| `src/AccountModal.jsx`, `src/auth.jsx` | Account pop-up (sign in, forgot / change password), and who's signed in / whether they're an editor |
| `src/supabase.js` | The connection to Supabase |
| `src/monkeyData.js`, `src/useMonkeyData.js` | Reading and saving monkeys (with the built-in copy as a fallback) |
| `src/Game.jsx`, `src/gameLogic.js` | Guess The Monkey |
| `src/ModalPDF.jsx` | The PDF pop-up (count, warning, progress) |
| `src/MonkeyPDF.jsx` | Layout of the PDF profile book (cover page, rows of monkeys) |
| `src/pdfPhotos.js` | Converts photos to JPG for the PDF (the PDF library can't use WebP) |
| `src/useDialog.js` | Keyboard and focus behaviour shared by the pop-ups |
| `src/MonkeyIcon.jsx`, `src/monkeyIconPath.js` | The monkey logo as a vector (used on the site and in the PDF) |
| `src/monkeysArr.js`, `src/groupsArr.js` | The built-in copy of the data (fallback only) |
| `src/*.test.js(x)` | Tests |
| `supabase/schema.sql` | Database tables, data rules and who can do what |
| `supabase/seed.sql` | The original data loaded into the database (made by `make-seed.mjs`) |
| `supabase/storage.sql` | Photo storage and its access rules |
| `supabase/change-history.sql` | Change history and daily summary emails |
| `supabase/new-editors.sql` | Makes every account added in Supabase an editor |
| `.github/workflows/deploy.yml` | Tests, builds and publishes the site on every push to `master` |
| `.github/workflows/keep-awake.yml` | Pings the database every 3 days so the free Supabase project isn't paused |

The `supabase/*.sql` files have already been run. They're kept as a record of how the database is set up, and to rebuild it if ever needed.

### Notes

- **Access:** anyone can view the site. Only signed-in editors can change monkeys or photos; the database enforces this itself, not just the website.
- **PDF photos:** the PDF library only supports JPG/PNG, so `pdfPhotos.js` redraws each photo as a JPG in the browser. Large PDFs (all troops) download every photo and can take several minutes.
- **The PDF library is loaded only when a PDF is created**, which keeps the site itself quick to load.
- **Keyboard:** Tab through cards, Enter to open, ← / → for previous/next monkey, Escape to close. In the game, Enter or Space starts, and keys 1–4 pick an answer.
