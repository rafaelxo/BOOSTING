-- ============================================================
-- Migration 011: Add personal/PIX fields to booster_applications
-- ============================================================

alter table public.booster_applications
  add column if not exists full_name text,
  add column if not exists email     text,
  add column if not exists phone     text,
  add column if not exists cpf       text;
