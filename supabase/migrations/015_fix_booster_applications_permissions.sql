-- ============================================================
-- Migration 015: Fix booster_applications permissions
-- Run this in Supabase SQL Editor if inserts from the browser fail
-- ============================================================

-- Ensure anon + authenticated can insert applications
grant usage on schema public to anon, authenticated;
grant insert on public.booster_applications to anon, authenticated;
grant select on public.booster_applications to authenticated;

-- Re-assert the permissive RLS policy (in case it was dropped)
drop policy if exists "Anyone can submit an application" on public.booster_applications;
create policy "Anyone can submit an application"
  on public.booster_applications for insert
  with check (true);
