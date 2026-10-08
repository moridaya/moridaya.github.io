-- =====================================================================
-- Moridaya 004: all-time favorites
--
-- Run AFTER setup.sql, 002 and 003. Safe to run more than once.
--
-- favorite_categories  your categories (editable from the posting page)
-- favorites            one row per favorite; the current one has no end date
--                      ("until" is empty). Replacing a favorite closes the old
--                      one (until = the new one's start) and keeps it as history.
--
-- Anyone can read. Only the owner can add, change or delete (same is_owner()
-- check as entries, including 2-step login when it's on).
-- =====================================================================

create table if not exists public.favorite_categories (
  id          bigint generated always as identity primary key,
  name        text not null,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  constraint favorite_categories_name_ok check (char_length(btrim(name)) between 1 and 60)
);
create unique index if not exists favorite_categories_name_idx on public.favorite_categories (lower(name));

create table if not exists public.favorites (
  id           bigint generated always as identity primary key,
  category_id  bigint not null references public.favorite_categories (id) on delete cascade,
  name         text not null,
  why          text,
  photo        text,               -- storage path in the media bucket, optional
  since        date not null default (now() at time zone 'Asia/Manila')::date,
  until        date,               -- empty = still the favorite
  created_at   timestamptz not null default now(),
  constraint favorites_name_ok  check (char_length(btrim(name)) between 1 and 200),
  constraint favorites_why_ok   check (why is null or char_length(why) <= 300),
  constraint favorites_photo_ok check (photo is null or photo ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}/[a-z0-9]{6,40}\.[a-z0-9]{2,5}$'),
  constraint favorites_dates_ok check (until is null or until >= since)
);
create index if not exists favorites_category_idx on public.favorites (category_id, since desc);
-- at most one current favorite per category
create unique index if not exists favorites_one_current_idx on public.favorites (category_id) where until is null;

alter table public.favorite_categories enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "favorite categories: read" on public.favorite_categories;
create policy "favorite categories: read" on public.favorite_categories
  for select to anon, authenticated using (true);
drop policy if exists "favorite categories: owner writes" on public.favorite_categories;
create policy "favorite categories: owner writes" on public.favorite_categories
  for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "favorites: read" on public.favorites;
create policy "favorites: read" on public.favorites
  for select to anon, authenticated using (true);
drop policy if exists "favorites: owner writes" on public.favorites;
create policy "favorites: owner writes" on public.favorites
  for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

grant select on public.favorite_categories, public.favorites to anon, authenticated;
grant insert, update, delete on public.favorite_categories, public.favorites to authenticated;

-- Make something the new favorite in a category. The current one (if any) becomes
-- history, ending the day the new one starts. Runs with the caller's permissions,
-- so only the owner can use it.
create or replace function public.set_favorite(
  p_category bigint, p_name text, p_why text, p_photo text, p_since date
) returns public.favorites
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.favorites;
  since_day date := coalesce(p_since, (now() at time zone 'Asia/Manila')::date);
begin
  update public.favorites
     set until = greatest(since, since_day)
   where category_id = p_category and until is null;
  insert into public.favorites (category_id, name, why, photo, since)
  values (p_category, btrim(p_name), nullif(btrim(coalesce(p_why, '')), ''), p_photo, since_day)
  returning * into result;
  return result;
end;
$$;
revoke execute on function public.set_favorite(bigint, text, text, text, date) from public, anon;
grant execute on function public.set_favorite(bigint, text, text, text, date) to authenticated;

-- Starting categories (only if there are none yet). Rename or delete them any time.
insert into public.favorite_categories (name, position)
select v.name, v.pos
from (values
  ('philosopher', 1), ('chess player', 2), ('FlipTop emcee', 3), ('food', 4), ('song', 5),
  ('book', 6), ('movie', 7), ('place', 8), ('emotion', 9), ('word', 10)
) as v(name, pos)
where not exists (select 1 from public.favorite_categories);
