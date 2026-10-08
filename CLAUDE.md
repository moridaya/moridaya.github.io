# Moridaya: notes for Claude

Moridaya is Deffoh's public diary and life archive: what he did each day (thoughts,
things learned, fasting, runs, photos, songs...). Anyone can read it. Only he can post.
README.md has the setup steps and the entry field reference; this file has the rules.

## Working with Deffoh

- BS Economics student, not a developer. Explain steps plainly, casual tone is fine,
  be direct and give reasons. Say what *he* has to do (e.g. re-run SQL) clearly.
- Keep changes small and reviewable. Work on a branch, open a pull request, never push to `main`.
- Database changes go in a NEW numbered file (`sql/002_speed.sql`, `sql/003_...`), never edits
  to `setup.sql` or older files. Each file is idempotent (safe to re-run) and he pastes it into
  the Supabase SQL editor himself; always tell him which files to run, in order.
- When working unattended: don't stop to ask, pick the most reasonable option and list every
  decision in the PR description. One PR per group of work, push after each finished item.
- Claude can't reach his live Supabase from the sandbox. Test with Playwright against a
  mocked Supabase API (real supabase-js), and say plainly that live testing is his step.

## Stack and layout

- Plain HTML, CSS, JavaScript. No framework, no build step, no npm at runtime.
- GitHub Pages from `main` (repo `moridaya/moridaya.github.io`). Supabase (free tier) for
  database, storage (bucket `media`) and login.
- Folders by language: `/index.html`, `/html/` (other pages), `/css/style.css`, `/js/` (one
  file per feature), `/sql/setup.sql` (whole database; idempotent, safe to re-run), `404.html`.
- JS: classic scripts (not modules), ES5-style `var`/`function` plus async/await where it
  reads better. Everything shared hangs off `window.Moridaya` (`M`). All scripts are in
  `<head>` with `defer` (download in parallel, run in order after parsing), except
  `theme.js`, which runs immediately so the page never flashes the wrong theme. Order:
  vendor supabase -> config -> db -> render -> (lightbox, bento) -> ribbon -> page script.
- Fonts are self-hosted in `/fonts` (Latin-subset woff2, SIL OFL) with `@font-face` at the
  top of `style.css`; the two main ones are preloaded. No Google Fonts requests.
- Each page has `<link rel="preconnect">` to the Supabase project URL (hard-coded; update it
  if the project ever changes).
- `js/vendor/supabase-2.45.4.js` is the unmodified npm file (hash in `js/vendor/README.md`).
  Never load scripts from a CDN.

## Security rules (don't break these)

- Only the Project URL and anon key go in `js/config.js`. Never the `service_role` /
  `sb_secret_` key, anywhere.
- Permissions live in the database (RLS), never in JS. `public.is_owner()` = listed in
  `site_owner` AND (session is `aal2` OR no verified 2-step factor). Every write and every
  private read goes through it.
- Never insert user content as HTML. Build DOM with `M.el()` / `textContent`; links only via
  `M.link()` (http/https only). No `innerHTML`, no inline scripts, no inline `style=""`.
- Every page carries the same Content Security Policy `<meta>` (scripts/styles/fonts only
  from this site; network only to Supabase, Open-Meteo, iTunes; frames only YouTube-nocookie
  and Spotify; no workers; upgrade-insecure-requests). If a page needs a new outside host,
  add it to the CSP on every page and say why.
- No third-party scripts. The vendored Supabase library is loaded with Subresource Integrity
  (`integrity="sha384-..."`); if it's ever replaced, update the hash on every page (command in
  `js/vendor/README.md`).
- The database refuses bad data by itself (`sql/003_hardening.sql`): each type's required
  fields, text/number/link limits, valid media paths and tags, no future `entry_date`, and
  `created_at` set by the server (can't be faked). Keep the posting form's `need` rules and
  these database rules in sync when adding a type or field.
- `site_owner` and `site_stats` are unreachable from the API (RLS on, no rules, privileges
  revoked). Only `bump_visits()` / `get_visits()` touch the counter.
- Errors: every page part ends in data or a short message; unhandled errors are logged
  quietly (`js/db.js` safety nets), and leftover "loading..." text is replaced after 20 s.
- Keep-alive: `.github/workflows/keep-alive.yml` pings Supabase every 3 days with the public
  anon key read from `js/config.js` (no secrets, no third-party actions).
- Secrets audit (all files + full git history): only the anon key was ever committed. His
  email appears only in commit author info from GitHub-website commits (fix: GitHub >
  Settings > Emails > "Keep my email addresses private").
- Photos are `<button class="zoom">` around an `<img>`, never links to the storage file.
  Never show file names, storage paths or raw URLs in the UI. Link text without a title
  falls back to the Wikipedia title or the site name.
- Login lockout (3 wrong tries -> 15 min, doubling to 8 h) is a speed bump; Supabase rate
  limits + 2-step login are the real protection.
- Visitor counter: everyone adds 1 (not the owner), only the owner sees the number
  (`get_visits()` returns null otherwise).

## Loading: fast, and never hangs

- Two connections (`js/db.js`):
  - `M.db`: public, never reads or refreshes the saved login, so it can't hang because of
    it. Use it for everything public.
  - `M.authClient()`: the logged-in connection (posting page). `M.ownerClient()` returns it
    only when this browser has a saved login (`M.hasStoredSession()`), else null.
- Every request has a time limit: fetch is wrapped (10 s), `M.withTimeout()` for anything
  else. The supabase-js login lock waits at most 4 s, then takes the lock over (`steal`);
  by default it waits forever, which made logged-in browsers hang (frozen tab holding the
  lock, or a token refresh that never answered).
- Pages load in layers with `M.layered()`: cached copy (instant) -> public data -> owner's
  data (private entries) on top. Owner failures never blank the page; show a short note.
  Only public data is cached (`M.cache`, localStorage), never private entries.
- Fetch only the columns a page needs. Run independent requests in parallel.
- RLS policies call `(select public.is_owner())` so Postgres checks it once per query.

## Time: always Manila

- "Today" is always `M.manilaDate()` (Asia/Manila, UTC+8, no daylight saving), never the
  browser's timezone and never the UTC part of a timestamp.
- Match days by `entry_date`, never by `created_at`. Show times with `M.formatTime()`.
- Pages that show "today" call `M.reloadAtMidnight(today)`; at 12:00 AM Manila the home page
  rolls over (today's area empties) and the archive gains yesterday.
- The posting page's date follows Manila today until changed by hand, and is re-read at save.
- Test midnight logic with Playwright's fake clock at 11:59 PM and 12:01 AM Manila, with the
  browser in several timezones (Asia/Manila, UTC, America/Los_Angeles).

## Design

- Old-internet look: white background, navy `#000080` headings and borders, default blue
  links `#0000ee`, purple visited. No gradients, no emoji, no modern "card" styling.
  Colors are CSS variables on `:root` with a dark set under `:root[data-theme="dark"]`.
- Dark mode: one sun/moon button at the top right, saved in localStorage (try/catch).
- Fonts are four variables: `--font-head`, `--font-body`, `--font-meta`, `--font-mono`.
  Current pairing is **2. Retro serif** (IM Fell English + Old Standard TT, self-hosted);
  Verdana for small meta text, Courier New for counters. `html/fonts.html` previews the three
  options. To switch: change the variables and the font preload `<link>`s on each page.
- Narrow centered column (max 860px), works on phones (16px side padding, things stack
  below 640px, no sideways scroll).
- Empty states are short lines in the site's voice, e.g. "Nothing yet today. A new page,
  waiting.", "No chapters yet.", "Nothing was written on this day."

## Pages

- **Home** (`index.html`): header (title, subtitle, last updated, Manila weather; top right
  dark-mode button and DAY counter), ribbon, one-line quote of the day, today's **bento
  grid**, then NOW and On this day side by side, footer (visitor counter for the owner, post
  link). No archive list or hobby list on the home page.
- **Bento grid** (`js/bento.js`), used on home and day pages:
  - 4 columns, `grid-auto-flow: dense`, no visible boxes (spacing + the small label line).
  - Sizes: S 1x1 = song, quote, mood, body, goal, reading; M 2x1 = run, fasting, thought,
    food, other; L 2x2 = photo, learned, anything with a picture/video, any text over 280
    characters; XL 4x2 = when the day has exactly one entry.
  - Home must fit one screen: 3 rows whose height follows the window. Too much: shrink
    oldest text tiles first (L->M->S), pictures last, then keep the newest and add
    "+N more from today »" to the day page. Clipped text gets "more »" to `day.html#e-<id>`.
  - Day page: every entry, rows grow to fit (nothing clipped). Phones: one column.
- **Archive** (`html/archive.html`): every past day with entries, newest first, grouped by
  month, as chapters ("Ch. 0042 Thursday, October 8 · 3 entries"). Chapter number = days
  since the first entry + 1. Today joins at midnight.
- **Day** (`html/day.html?date=YYYY-MM-DD`): chapter, saved weather, entry count,
  previous/next day; handles impossible, future and empty dates.
- **Post** (`html/post.html`): login (+ optional 2-step), one form whose fields change by
  type, photo compression to ~300 KB JPEG (song covers ~600px/120 KB), edit/delete recent.
- **Ribbon** (`js/ribbon.js`): `[home] [archive] [favorites] [hobbies] [bookshelf] [quotes]
  [goals] [places] [about]`. Pages not built yet have no `ready: true` flag and show gray
  "(soon)", not clickable. When you build a page, set its flag in the same PR. Only
  [places] is still "soon". **Random day was dropped (he doesn't want it); don't build it.**
- **Favorites** (`html/favorites.html`, tables in `sql/004_favorites.sql`): editable
  categories (seeded: philosopher, chess player, FlipTop emcee, food, song, book, movie,
  place, emotion, word). A favorite = name, optional photo (600px/120 KB), one-line why,
  since date. The current one has empty `until`; `set_favorite()` closes the old one
  (until = new since) so history shows "previously: X, from A to B". Empty categories are
  hidden on the public page. Managed in the Favorites box on the posting page
  (`js/post-favorites.js`, which uses helpers post.js exposes as `M.post`).
- **Hobbies**: every tag with its count; `hobbies.html?tag=x` shows that tag's entries as a
  bento grid with dates (`showDate`). **Quotes**: every quote, newest first.
  **Bookshelf**: built from reading entries; same title (ignoring case) = one book;
  finished once any entry has `finished`; pages logged = sum of each book's highest page.
  **Goals**: active / done / dropped from goal entries (`done`, `dropped`, `closed_on`).
  **About**: static placeholder text he fills in himself.
- Phones (< 640px): header, title, ribbon, day counter and theme button are centered;
  entry text stays left-aligned.

- **Song search** (`js/song-search.js`): on song entries, type to search the iTunes Search
  API (`media=music&entity=song&country=PH`, no key, debounced 350 ms, newest search wins);
  a pick fills title, artist and 600px album art (`/600x600bb.`). If iTunes can't be reached
  the form says so and still works by hand. The CSP allows `itunes.apple.com` for this.
- **Daily weather** (`M.saveTodayWeather` in `js/weather.js`): the owner's posting page
  saves today's Open-Meteo forecast (high, low, condition) into `day_weather` once per day
  if it's missing (`upsert ... ignoreDuplicates`). Only the owner writes weather, so
  visitors can't fake it. The day page shows "Manila: high 32°C, light rain". Days he
  doesn't open the posting page get no weather (they have no entries either).
- **Favicon**: `favicon.svg` (navy square, white serif M) + `favicon.ico`, linked on every
  page. **404**: `404.html`, old-web "Not Found ... Server at ... Port 443" style,
  absolute paths (GitHub Pages serves it for any missing URL).

## Data

- One table `entries` (see README "Entry fields" for each type's `data`), plus
  `day_weather`, `site_owner`, `site_stats`. Helper RPCs: `entry_dates()`, `tag_counts()`,
  `on_this_day(d)`, `bump_visits()`, `get_visits()`.
- `media` holds storage paths (`YYYY/MM/DD/<random>.jpg`) or YouTube links. Videos are
  YouTube links only (embedded via youtube-nocookie).

## Build order / what's left

Done: 1 database, 2 home, 3 posting, 4 archive + day, favorites, hobbies, quotes,
bookshelf, goals, about, song search, daily weather, favicon, 404. Random day: dropped.
Left: [places] (still "soon").
Later, not v1: weight graph, year-in-pixels mood grid, "changed my mind" log, letter to
future self, RSS, search, places map.
