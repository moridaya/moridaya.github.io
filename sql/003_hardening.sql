-- =====================================================================
-- Moridaya 003: hardening
--
-- Run AFTER setup.sql and 002_speed.sql. Safe to run more than once.
--
-- Rules the database itself enforces, so bad or huge data can't be saved
-- even by someone calling the API directly (not just through the site).
-- Only the owner can write at all (see setup.sql), so this mostly guards
-- against mistakes and a stolen login.
--
-- Existing rows are NOT re-checked ("not valid"), so this never fails
-- because of something already saved; new and edited rows are checked.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Helper checks (pure functions, used by the rules below)
-- ---------------------------------------------------------------------

-- A text field is either missing or a string of at most `max_len` characters.
create or replace function public.json_text_ok(d jsonb, field text, max_len int)
returns boolean language sql immutable as $$
  select case
    when d -> field is null or jsonb_typeof(d -> field) = 'null' then true
    when jsonb_typeof(d -> field) <> 'string' then false
    else char_length(d ->> field) <= max_len
  end;
$$;

-- A link field is either missing or an http(s) link of reasonable length.
create or replace function public.json_url_ok(d jsonb, field text)
returns boolean language sql immutable as $$
  select case
    when d -> field is null or jsonb_typeof(d -> field) = 'null' then true
    when jsonb_typeof(d -> field) <> 'string' then false
    else (d ->> field) ~* '^https?://[^\s<>"]+$' and char_length(d ->> field) <= 2000
  end;
$$;

-- A number field is either missing or a number between lo and hi.
create or replace function public.json_num_ok(d jsonb, field text, lo numeric, hi numeric)
returns boolean language sql immutable as $$
  select case
    when d -> field is null or jsonb_typeof(d -> field) = 'null' then true
    when jsonb_typeof(d -> field) <> 'number' then false
    else (d ->> field)::numeric between lo and hi
  end;
$$;

-- "Has something": a non-empty string or a number.
create or replace function public.json_has(d jsonb, field text)
returns boolean language sql immutable as $$
  -- coalesce: a missing field must count as "no", never as "unknown" (which a rule lets pass)
  select coalesce((jsonb_typeof(d -> field) = 'string' and btrim(d ->> field) <> '')
      or jsonb_typeof(d -> field) = 'number', false);
$$;

-- Each media item is a storage path like 2026/10/08/k3j9x0q2m1zp.jpg or an https link.
create or replace function public.media_ok(items text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(
    m ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}/[a-z0-9]{6,40}\.[a-z0-9]{2,5}$'
    or (m ~* '^https://[^\s<>"]+$' and char_length(m) <= 500)
  ), true)
  from unnest(items) as m;
$$;

-- Each tag is 1-50 characters, no line breaks.
create or replace function public.tags_ok(items text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(char_length(t) between 1 and 50 and t !~ '[\r\n]'), true)
  from unnest(items) as t;
$$;


-- ---------------------------------------------------------------------
-- 2. Rules on entries
-- ---------------------------------------------------------------------

alter table public.entries drop constraint if exists entries_shape;
alter table public.entries add constraint entries_shape check (
  jsonb_typeof(data) = 'object'
  and public.media_ok(media)
  and public.tags_ok(tags)
  -- long text fields
  and public.json_text_ok(data, 'text', 20000)
  and public.json_text_ok(data, 'own_words', 20000)
  and public.json_text_ok(data, 'note', 5000)
  and public.json_text_ok(data, 'caption', 1000)
  -- short text fields
  and public.json_text_ok(data, 'topic', 300)
  and public.json_text_ok(data, 'title', 300)
  and public.json_text_ok(data, 'artist', 300)
  and public.json_text_ok(data, 'author', 300)
  and public.json_text_ok(data, 'source', 300)
  and public.json_text_ok(data, 'mood', 100)
  -- links
  and public.json_url_ok(data, 'wikipedia_url')
  and public.json_url_ok(data, 'album_art')
  and public.json_url_ok(data, 'spotify_url')
  -- numbers in sane ranges
  and public.json_num_ok(data, 'distance_km', 0, 1000)
  and public.json_num_ok(data, 'minutes', 0, 10000)
  and public.json_num_ok(data, 'weight_kg', 1, 500)
  and public.json_num_ok(data, 'height_cm', 30, 300)
  and public.json_num_ok(data, 'page', 0, 100000)
) not valid;

-- What each type must have (the same rules as the posting form).
alter table public.entries drop constraint if exists entries_required_fields;
alter table public.entries add constraint entries_required_fields check (
  case type
    when 'thought' then public.json_has(data, 'text')
    when 'learned' then public.json_has(data, 'topic') or public.json_has(data, 'wikipedia_url')
    when 'fasting' then public.json_has(data, 'start')
    when 'run'     then public.json_has(data, 'distance_km') or public.json_has(data, 'minutes')
    when 'photo'   then cardinality(media) > 0
    when 'song'    then public.json_has(data, 'title')
    when 'quote'   then public.json_has(data, 'text')
    when 'reading' then public.json_has(data, 'title')
    when 'body'    then public.json_has(data, 'weight_kg') or public.json_has(data, 'height_cm')
    when 'food'    then public.json_has(data, 'text') or cardinality(media) > 0
    when 'goal'    then public.json_has(data, 'text')
    when 'mood'    then public.json_has(data, 'mood')
    else false
  end
) not valid;

-- Dates and timestamps can't be faked: created_at is always "now" when a row is
-- created and never changes; entry_date can't be in the future (Manila time) or
-- before the year 2000.
create or replace function public.entries_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  if new.entry_date > (now() at time zone 'Asia/Manila')::date + 1 then
    raise exception 'entry_date % is in the future', new.entry_date;
  end if;
  if new.entry_date < date '2000-01-01' then
    raise exception 'entry_date % is too far in the past', new.entry_date;
  end if;
  return new;
end;
$$;

drop trigger if exists entries_guard on public.entries;
create trigger entries_guard before insert or update on public.entries
  for each row execute function public.entries_guard();


-- ---------------------------------------------------------------------
-- 3. Rules on saved weather
-- ---------------------------------------------------------------------

alter table public.day_weather drop constraint if exists day_weather_sane;
alter table public.day_weather add constraint day_weather_sane check (
  (temp_c is null or temp_c between -30 and 60)
  and (summary is null or char_length(summary) <= 100)
  and jsonb_typeof(data) = 'object'
  and octet_length(data::text) <= 20000
  and weather_date >= date '2000-01-01'
) not valid;


-- ---------------------------------------------------------------------
-- 4. Lock-down double check
--    site_owner and site_stats have Row Level Security on and NO rules, so
--    the API can't read or change them at all. Remove any table privileges
--    too, so it stays that way even if a rule were ever added by mistake.
-- ---------------------------------------------------------------------

revoke all on table public.site_owner from anon, authenticated;
revoke all on table public.site_stats from anon, authenticated;
alter table public.site_owner enable row level security;
alter table public.site_stats enable row level security;

-- (The helper checks in part 1 stay callable: rules run with the permissions of whoever
-- is saving, so the owner must be able to run them. They only answer true/false.)
