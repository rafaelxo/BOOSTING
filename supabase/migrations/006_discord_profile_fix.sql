-- ============================================================
-- Migration 006: Resilient handle_new_user + ensure_profile_exists RPC
-- Fixes Discord OAuth users not getting a profile row created
-- ============================================================

-- ─── 1. Hardened handle_new_user trigger ─────────────────────────────────────
--
-- Previous version failed silently for Discord OAuth users when:
--   a) email is NULL (Discord users without verified email)
--   b) username derived from email prefix already exists (unique constraint)
-- Supabase GoTrue isolates trigger failures → auth succeeds, profile missing.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role     user_role;
  v_email    text;
  v_username text;
begin
  v_role := case
    when new.raw_user_meta_data->>'role' = 'booster' then 'booster'::user_role
    else 'customer'::user_role
  end;

  -- Discord OAuth may omit email for unverified accounts
  v_email := coalesce(
    new.email,
    new.raw_user_meta_data->>'email',
    new.id::text || '@oauth.local'
  );

  -- Prefer explicit username metadata; fall back to email prefix or Discord name
  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'name',
    split_part(v_email, '@', 1),
    'user'
  );
  -- Sanitize to alphanumeric + underscore, max 30 chars
  v_username := left(regexp_replace(v_username, '[^a-zA-Z0-9_]', '_', 'g'), 30);
  if v_username = '' then v_username := 'user'; end if;

  -- Resolve unique constraint conflicts by appending a short ID suffix
  if exists (select 1 from public.profiles where username = v_username) then
    v_username := left(v_username, 22) || '_' || left(new.id::text, 7);
  end if;

  insert into public.profiles(id, email, role, username)
  values (new.id, v_email, v_role, v_username)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ─── 2. Safety-net RPC: ensure_profile_exists ────────────────────────────────
--
-- Called by the frontend after Discord OAuth when fetchProfile finds no row.
-- Runs as SECURITY DEFINER so it can read auth.users and insert into profiles
-- bypassing RLS (profiles has no INSERT policy — only the trigger can insert).

create or replace function public.ensure_profile_exists(p_display_name text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_email    text;
  v_username text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Already exists → nothing to do
  if exists (select 1 from public.profiles where id = auth.uid()) then
    return;
  end if;

  select email into v_email from auth.users where id = auth.uid();
  v_email := coalesce(v_email, auth.uid()::text || '@oauth.local');

  v_username := coalesce(
    p_display_name,
    split_part(v_email, '@', 1),
    'user'
  );
  v_username := left(regexp_replace(v_username, '[^a-zA-Z0-9_]', '_', 'g'), 30);
  if v_username = '' then v_username := 'user'; end if;

  if exists (select 1 from public.profiles where username = v_username) then
    v_username := left(v_username, 22) || '_' || left(auth.uid()::text, 7);
  end if;

  insert into public.profiles(id, email, role, username)
  values (auth.uid(), v_email, 'customer'::user_role, v_username)
  on conflict (id) do nothing;
end;
$$;

grant execute on function public.ensure_profile_exists(text) to authenticated;
