-- ============================================================
-- Migration — Legal acceptance tracking
-- ============================================================

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists legal_version text;

-- Existing accounts predate the explicit checkbox flow. Mark them as accepted
-- for compatibility so only newly created accounts are gated.
update public.profiles
set
  terms_accepted_at = coalesce(terms_accepted_at, now()),
  privacy_accepted_at = coalesce(privacy_accepted_at, now()),
  legal_version = coalesce(legal_version, '2026-06-26')
where terms_accepted_at is null
   or privacy_accepted_at is null
   or legal_version is null;
