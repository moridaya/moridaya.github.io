-- =====================================================================
-- Moriyada 005: books, quotes, goals and hobbies get their own tabs
--
-- Run AFTER setup.sql, 002, 003 and 004. Safe to run more than once.
--
-- These are no longer daily posts. Each lives in its own table, is posted
-- from its own tab (owner only), and never shows up in the daily feed:
--   books    title, author, cover photo, reading/finished, my thoughts
--   quotes   the line + who said it (no explanation)
--   goals    title, steps (a checklist), how I feel right now, status
--   hobbies  name, photo, why I love it, since when
--
-- It also MOVES any old reading / quote / goal daily posts into the new
-- tables (and out of the daily feed), so nothing is duplicated.
--
-- Anyone can read. Only the owner can add, change or delete (same
-- is_owner() check as everything else, including 2-step login).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.books (
  id           bigint generated always as identity primary key,
  title        text not null,
  author       text,
  cover        text,                -- storage path in the media bucket, optional
  status       text not null default 'reading',
  thoughts     text,
  started_on   date not null default (now() at time zone 'Asia/Manila')::date,
  finished_on  date,
  created_at   timestamptz not null default now(),
  constraint books_title_ok    check (char_length(btrim(title)) between 1 and 300),
  constraint books_author_ok   check (author is null or char_length(author) <= 200),
  constraint books_cover_ok    check (cover is null or cover ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}/[a-z0-9]{6,40}\.[a-z0-9]{2,5}$'),
  constraint books_status_ok   check (status in ('reading', 'finished')),
  constraint books_thoughts_ok check (thoughts is null or char_length(thoughts) <= 10000),
  constraint books_dates_ok    check (finished_on is null or finished_on >= started_on)
);

create table if not exists public.quotes (
  id          bigint generated always as identity primary key,
  text        text not null,
  source      text,                 -- who said it
  saved_on    date not null default (now() at time zone 'Asia/Manila')::date,
  created_at  timestamptz not null default now(),
  constraint quotes_text_ok   check (char_length(btrim(text)) between 1 and 600),
  constraint quotes_source_ok check (source is null or char_length(source) <= 200)
);

create table if not exists public.goals (
  id          bigint generated always as identity primary key,
  title       text not null,
  steps       jsonb not null default '[]',   -- [{"text": "...", "done": true/false}, ...]
  feeling     text,                          -- how I feel about it right now
  status      text not null default 'active',
  started_on  date not null default (now() at time zone 'Asia/Manila')::date,
  closed_on   date,                          -- when it was done or dropped
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint goals_title_ok   check (char_length(btrim(title)) between 1 and 200),
  constraint goals_steps_ok   check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 40
                                     and octet_length(steps::text) <= 20000),
  constraint goals_feeling_ok check (feeling is null or char_length(feeling) <= 3000),
  constraint goals_status_ok  check (status in ('active', 'done', 'dropped')),
  constraint goals_dates_ok   check (closed_on is null or closed_on >= started_on)
);

create table if not exists public.hobbies (
  id          bigint generated always as identity primary key,
  name        text not null,
  photo       text,
  why         text,
  since       date,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  constraint hobbies_name_ok  check (char_length(btrim(name)) between 1 and 100),
  constraint hobbies_photo_ok check (photo is null or photo ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}/[a-z0-9]{6,40}\.[a-z0-9]{2,5}$'),
  constraint hobbies_why_ok   check (why is null or char_length(why) <= 2000)
);

create index if not exists books_status_idx on public.books (status, started_on desc);
create index if not exists quotes_saved_idx on public.quotes (saved_on desc, id desc);
create index if not exists goals_status_idx on public.goals (status, started_on desc);


-- ---------------------------------------------------------------------
-- 2. Who can do what: anyone reads, only the owner writes
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['books', 'quotes', 'goals', 'hobbies'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: read" on public.%I', t, t);
    execute format('create policy "%s: read" on public.%I for select to anon, authenticated using (true)', t, t);
    execute format('drop policy if exists "%s: owner writes" on public.%I', t, t);
    execute format('create policy "%s: owner writes" on public.%I for all to authenticated '
                   'using ((select public.is_owner())) with check ((select public.is_owner()))', t, t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 3. Move old reading / quote / goal daily posts into the new tables
--    (all or nothing; running it again finds nothing left to move)
-- ---------------------------------------------------------------------

do $$
begin
  -- Reading posts: one book per title (ignoring capitals). Started = first post,
  -- finished = the day one was ticked "finished", thoughts = the notes, in order.
  insert into public.books (title, author, status, thoughts, started_on, finished_on)
  select
    min(btrim(e.data->>'title')),
    max(nullif(btrim(e.data->>'author'), '')),
    case when bool_or(coalesce((e.data->>'finished')::boolean, false)) then 'finished' else 'reading' end,
    nullif(string_agg(nullif(btrim(e.data->>'note'), ''), E'\n\n' order by e.entry_date, e.created_at), ''),
    min(e.entry_date),
    min(e.entry_date) filter (where coalesce((e.data->>'finished')::boolean, false))
  from public.entries e
  where e.type = 'reading' and nullif(btrim(e.data->>'title'), '') is not null
  group by lower(btrim(e.data->>'title'));

  -- Quotes: the line and who said it.
  insert into public.quotes (text, source, saved_on)
  select btrim(e.data->>'text'), nullif(btrim(e.data->>'source'), ''), e.entry_date
  from public.entries e
  where e.type = 'quote' and nullif(btrim(e.data->>'text'), '') is not null;

  -- Goals: title from the old text; old note becomes "how I feel".
  insert into public.goals (title, feeling, status, started_on, closed_on)
  select
    left(btrim(e.data->>'text'), 200),
    nullif(btrim(e.data->>'note'), ''),
    case when coalesce((e.data->>'done')::boolean, false) then 'done'
         when coalesce((e.data->>'dropped')::boolean, false) then 'dropped'
         else 'active' end,
    e.entry_date,
    case when (e.data->>'closed_on') ~ '^\d{4}-\d{2}-\d{2}$'
          and (e.data->>'closed_on')::date >= e.entry_date
         then (e.data->>'closed_on')::date end
  from public.entries e
  where e.type = 'goal' and nullif(btrim(e.data->>'text'), '') is not null;

  -- Now they live in their tabs, so they leave the daily feed.
  delete from public.entries where type in ('reading', 'quote', 'goal');
end $$;
