-- =====================================================================
-- Moridaya 002: speed
--
-- Run AFTER setup.sql. Paste into Supabase > SQL Editor > New query > Run.
-- Safe to run more than once. Changes no data and no permissions: it only
-- makes the same rules and queries faster.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Indexes for the queries the site runs most
-- ---------------------------------------------------------------------

-- NOW box: "latest reading / body / fasting / learned / goal"
create index if not exists entries_type_day_idx
  on public.entries (type, entry_date desc, created_at desc);

-- "last updated" in the header
create index if not exists entries_created_at_idx
  on public.entries (created_at desc);

-- "On this day": same month and day in earlier years
create index if not exists entries_month_day_idx
  on public.entries ((extract(month from entry_date)), (extract(day from entry_date)));

-- (Already there from setup.sql: entry_date for day pages, tags for hobbies.)


-- ---------------------------------------------------------------------
-- 2. Same security rules, checked once per request instead of once per row
--
--    Writing "(select public.is_owner())" lets Postgres work out the answer
--    once for the whole query. "public.is_owner()" alone can be re-checked
--    for every row. Who can do what is exactly the same as before.
-- ---------------------------------------------------------------------

drop policy if exists "entries: read" on public.entries;
create policy "entries: read" on public.entries
  for select to anon, authenticated
  using (not private or (select public.is_owner()));

drop policy if exists "entries: owner inserts" on public.entries;
create policy "entries: owner inserts" on public.entries
  for insert to authenticated
  with check ((select public.is_owner()));

drop policy if exists "entries: owner updates" on public.entries;
create policy "entries: owner updates" on public.entries
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

drop policy if exists "entries: owner deletes" on public.entries;
create policy "entries: owner deletes" on public.entries
  for delete to authenticated
  using ((select public.is_owner()));

drop policy if exists "weather: owner writes" on public.day_weather;
create policy "weather: owner writes" on public.day_weather
  for all to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

drop policy if exists "media: owner reads" on storage.objects;
create policy "media: owner reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (select public.is_owner()));

drop policy if exists "media: owner uploads" on storage.objects;
create policy "media: owner uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_owner()));

drop policy if exists "media: owner updates" on storage.objects;
create policy "media: owner updates" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (select public.is_owner()))
  with check (bucket_id = 'media' and (select public.is_owner()));

drop policy if exists "media: owner deletes" on storage.objects;
create policy "media: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select public.is_owner()));


-- ---------------------------------------------------------------------
-- 3. Refresh the planner's statistics so it uses the new indexes
-- ---------------------------------------------------------------------

analyze public.entries;
