# Moridaya

A public diary and life archive of Deffoh. Anyone can read it. Only Deffoh can post.

Plain HTML, CSS and JavaScript (no build step), hosted on GitHub Pages, with
Supabase for the database, photo storage and login.

```
/index.html   home page
/html/        other pages (archive, day, hobbies, post, random, about, ...)
/css/         stylesheets
/js/          scripts, one file per feature
/sql/         database setup to paste into Supabase
```

## One-time setup

You only do this once. Takes about 10 minutes.

### 1. Make the Supabase project

1. Go to <https://supabase.com>, sign in, click **New project**. Free tier is fine.
   Pick the **Southeast Asia (Singapore)** region so it's fast from Manila.
2. Wait for it to finish setting up (a minute or two).

### 2. Create the database

1. In Supabase, open **SQL Editor** (left sidebar) and click **New query**.
2. Open [`sql/setup.sql`](sql/setup.sql) from this repo, copy everything, paste it in, click **Run**.
3. You should see "Success. No rows returned". If you ever change that file
   later, you can run the whole thing again. It won't delete your entries.

### 3. Create your login and lock the door

1. **Authentication > Users > Add user > Create new user.** Use your email and a
   strong password. Tick "Auto Confirm User".
2. **Authentication > Sign In / Providers** (may be called "Providers" or
   "Settings"): turn **off** "Allow new users to sign up". Now nobody else can
   make an account.
3. Back in **SQL Editor**, run this one line with your email in it:

   ```sql
   insert into public.site_owner (user_id) select id from auth.users where email = 'YOUR-EMAIL-HERE' on conflict do nothing;
   ```

   This is what tells the database "this account is Deffoh". Even if sign-ups
   were ever turned back on by accident, other accounts still can't post,
   edit or delete, because the rules check this list, not just "is logged in".

### 4. Connect the website to Supabase

1. In Supabase go to **Project Settings > API** (or **Data API**).
2. Copy the **Project URL** and the **anon public** key.
3. Paste them into [`js/config.js`](js/config.js).

The anon key is meant to be public. It can only do what the database rules
allow, which is reading non-private entries. **Never** put the
`service_role` key anywhere in this repo: that one skips all the rules.

### 5. Turn on GitHub Pages

Repo **Settings > Pages**: source "Deploy from a branch", branch `main`, folder `/ (root)`.

## Posting

Go to the small **post** link at the bottom of the home page (or `/html/post.html`)
and log in. Pick a type and the form changes to match. A few things to know:

- **Photos** are shrunk in your browser to about 300 KB before uploading, so
  phone photos are fine. This also removes the hidden location data phones put in photos.
- **Times** (like fasting start/end) are always read as Manila time, even if
  your phone is set to another timezone.
- **Tags** are lowercased, so `Running` and `running` are the same hobby.
- **Recent posts** at the bottom let you edit or delete. Deleting an entry
  also deletes its photos.
- Staying logged in on a device also shows your private entries on the home page.
  Log out on shared computers.

## Why the security works

Anyone can read the JavaScript on a website, so a password check in JS would
be useless. Instead the rules live inside the database (Supabase "Row Level
Security"). Every request is checked there:

| Who | Can do |
| --- | --- |
| Anyone | read entries that aren't private, read weather, bump the visitor counter |
| Deffoh (logged in) | everything: read private entries, post, edit, delete, upload |

Photos go in a storage bucket called `media`. A photo can be opened by anyone
who has its exact link, but nobody else can list, upload or delete files, and
file names are random so links can't be guessed. That means a photo on a
private entry is hidden, but not locked: don't share its link.

## Entry fields

Every post is one row in the `entries` table. The common columns are
`entry_date`, `type`, `tags`, `media`, `private`. The type-specific stuff goes
in `data`:

| type | data fields |
| --- | --- |
| thought | `text` |
| learned | `topic`, `wikipedia_url`, `own_words`, `voice_note` (storage path, optional), `rabbit_hole` (list of `{title, url}`, optional) |
| fasting | `start`, `end` (date-times like `2026-10-08T20:00:00+08:00`), `note` |
| run | `distance_km`, `minutes`, `note` |
| photo | `caption` (photos themselves go in `media`) |
| song | `title`, `artist`, `album_art` (image link), `spotify_url` (optional) |
| quote | `text`, `source` |
| reading | `title`, `author`, `page` (optional), `note` |
| body | `weight_kg`, `height_cm` (either or both) |
| food | `text` (photos go in `media`) |
| goal | `text`, `target_date` (optional), `done` (true/false) |
| mood | `mood` (a word), `note` |

`media` holds storage paths (like `2026/10/08/x7k2.jpg`) or YouTube links.
Any field can be left out; the site just skips what isn't there.
