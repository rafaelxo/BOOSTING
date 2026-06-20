-- ============================================================
-- Migration 014: Explicit grants on booster_applications
-- Ensures anon + authenticated can insert applications
-- ============================================================

grant insert on public.booster_applications to anon, authenticated;
grant select on public.booster_applications to authenticated;
