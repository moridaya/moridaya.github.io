-- =====================================================================
-- Moridaya: database setup
--
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- It is safe to run more than once: it only creates what's missing and
-- refreshes the rules.
--
-- What it makes:
--   entries      one row per post (thought, run, song, ...)
--   day_weather  Manila weather saved once per date
--   site_owner   who counts as "Deffoh" (you add yourself, see the end)
--   site_stats   the visitor counter
--   media        the storage bucket for photos and voice notes
--
-- Who can do what (enforced by the database itself, not by JavaScript):
--   anyone   read entries that are not private, read weather,
--            bump the visitor counter
--   owner    everything: read private entries, post, edit, delete,
--            upload and delete files
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table if not exists public.entries (
  id          bigint generated always as identity primary key,
  -- Stored as an exact moment in time; the site shows it in Manila time.
  created_at  timestamptz not null default now(),
  -- The diary day this entry belongs to. Defaults to "today in Manila".
  entry_date  date not null default (now() at time zone 'Asia/Manila')::date,
  type        text not null check (type in (
                'thought', 'learned', 'fasting', 'run', 'photo', 'song',
                'quote', 'reading', 'body', 'food', 'goal', 'mood')),
  tags        text[] not null default '{}',
  data        jsonb not null default '{}',
  media       text[] not null default '{}',
  private     boolean not null default false
);

-- Sanity limits, so a mistake (or a stolen login) can't stuff giant rows in.
-- NOT VALID = only checked on new and edited rows, so re-running never fails on old data.
alter table public.entries drop constraint if exists entries_size_limits;
alter table public.entries add constraint entries_size_limits check (
  octet_length(data::text) <= 100000
  and cardinality(tags) <= 30
  and cardinality(media) <= 30
) not valid;

create index if not exists entries_entry_date_idx on public.entries (entry_date desc);
create index if not exists entries_type_idx       on public.entries (type, created_at desc);
create index if not exists entries_tags_idx       on public.entries using gin (tags);

create table if not exists public.day_weather (
  weather_date  date primary key,
  summary       text,            -- e.g. "partly cloudy"
  temp_c        numeric,         -- temperature when it was captured
  data          jsonb not null default '{}',  -- the raw Open-Meteo reply
  fetched_at    timestamptz not null default now()
);

create table if not exists public.site_owner (
  user_id  uuid primary key references auth.users (id) on delete cascade
);

create table if not exists public.site_stats (
  key    text primary key,
  value  bigint not null default 0
);
insert into public.site_stats (key, value) values ('visits', 0)
  on conflict (key) do nothing;


-- ---------------------------------------------------------------------
-- 2. "Is the logged-in person the owner?"
--    Used by every write rule below. It looks the user up in site_owner,
--    so a stranger with a Supabase account still can't write anything.
--    Once 2-step login is turned on (posting page), a login that only
--    used the password is NOT enough: the 6-digit code step is required.
-- ---------------------------------------------------------------------

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.site_owner where user_id = auth.uid()
  )
  and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    )
  );
$$;


-- ---------------------------------------------------------------------
-- 3. Row Level Security (the actual lock on the door)
-- ---------------------------------------------------------------------

alter table public.entries     enable row level security;
alter table public.day_weather enable row level security;
alter table public.site_owner  enable row level security;  -- no rules = no API access at all
alter table public.site_stats  enable row level security;  -- only touched through functions below

-- entries: public reads non-private rows, owner reads everything
drop policy if exists "entries: read" on public.entries;
create policy "entries: read" on public.entries
  for select to anon, authenticated
  using (not private or public.is_owner());

drop policy if exists "entries: owner inserts" on public.entries;
create policy "entries: owner inserts" on public.entries
  for insert to authenticated
  with check (public.is_owner());

drop policy if exists "entries: owner updates" on public.entries;
create policy "entries: owner updates" on public.entries
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists "entries: owner deletes" on public.entries;
create policy "entries: owner deletes" on public.entries
  for delete to authenticated
  using (public.is_owner());

-- day_weather: public reads, owner writes
drop policy if exists "weather: read" on public.day_weather;
create policy "weather: read" on public.day_weather
  for select to anon, authenticated
  using (true);

drop policy if exists "weather: owner writes" on public.day_weather;
create policy "weather: owner writes" on public.day_weather
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

grant select on public.entries, public.day_weather to anon, authenticated;
grant insert, update, delete on public.entries, public.day_weather to authenticated;


-- ---------------------------------------------------------------------
-- 4. Read helpers for the pages
--    These run with the visitor's own permissions ("security invoker"),
--    so private entries stay hidden from the public here too.
-- ---------------------------------------------------------------------

-- Archive list and day counter: every date that has entries, newest first.
create or replace function public.entry_dates()
returns table (day date, entry_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.entry_date, count(*)
  from public.entries e
  group by e.entry_date
  order by e.entry_date desc;
$$;

-- Hobbies page: every tag and how many entries use it.
create or replace function public.tag_counts()
returns table (tag text, entry_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.tag, count(*)
  from public.entries e, unnest(e.tags) as t(tag)
  group by t.tag
  order by t.tag;
$$;

-- "On this day": entries from the same month and day in earlier years.
create or replace function public.on_this_day(d date)
returns setof public.entries
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from public.entries e
  where extract(month from e.entry_date) = extract(month from d)
    and extract(day   from e.entry_date) = extract(day   from d)
    and e.entry_date < d
  order by e.entry_date desc, e.created_at desc;
$$;

grant execute on function public.entry_dates()      to anon, authenticated;
grant execute on function public.tag_counts()       to anon, authenticated;
grant execute on function public.on_this_day(date)  to anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. Visitor counter
--    Visitors can only add 1 or read the number, never set it.
-- ---------------------------------------------------------------------

create or replace function public.bump_visits()
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  update public.site_stats set value = value + 1
  where key = 'visits'
  returning value;
$$;

create or replace function public.get_visits()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.site_stats where key = 'visits';
$$;

grant execute on function public.bump_visits() to anon, authenticated;
grant execute on function public.get_visits()  to anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. Storage bucket for photos and voice notes
--    The bucket is "public", meaning a file can be opened by anyone who
--    has its exact link. Nobody but the owner can list, upload or delete.
--    File names get a random part, so links can't be guessed.
--    Only plain photo formats and audio are accepted (no SVG, which can
--    carry code).
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/*'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media: owner reads" on storage.objects;
create policy "media: owner reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and public.is_owner());

drop policy if exists "media: owner uploads" on storage.objects;
create policy "media: owner uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.is_owner());

drop policy if exists "media: owner updates" on storage.objects;
create policy "media: owner updates" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.is_owner())
  with check (bucket_id = 'media' and public.is_owner());

drop policy if exists "media: owner deletes" on storage.objects;
create policy "media: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.is_owner());


-- ---------------------------------------------------------------------
-- 7. Make yourself the owner
--    Do this AFTER creating your login under Authentication > Users.
--    Remove the two dashes at the start of the line below, put your
--    login email between the quotes, and run just that line.
-- ---------------------------------------------------------------------

-- insert into public.site_owner (user_id) select id from auth.users where email = 'YOUR-EMAIL-HERE' on conflict do nothing;
