-- ============================================================
-- Migration 009: Discord voice channels per order
-- Adds discord_id to profiles (captured on Discord OAuth login)
-- Adds discord_voice_channel_id to orders
-- ============================================================

-- ─── 1. New columns ──────────────────────────────────────────────────────────

alter table public.profiles add column if not exists discord_id text;
alter table public.orders   add column if not exists discord_voice_channel_id text;

-- ─── 2. Backfill discord_id for existing users ───────────────────────────────

update public.profiles p
set    discord_id = i.provider_id
from   auth.identities i
where  i.user_id = p.id
  and  i.provider = 'discord'
  and  p.discord_id is null;

-- ─── 3. Updated handle_new_user — captures discord_id from OAuth metadata ────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role       user_role;
  v_email      text;
  v_username   text;
  v_discord_id text;
begin
  v_role := case
    when new.raw_user_meta_data->>'role' = 'booster' then 'booster'::user_role
    else 'customer'::user_role
  end;

  v_email := coalesce(
    new.email,
    new.raw_user_meta_data->>'email',
    new.id::text || '@oauth.local'
  );

  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'name',
    split_part(v_email, '@', 1),
    'user'
  );
  v_username := left(regexp_replace(v_username, '[^a-zA-Z0-9_]', '_', 'g'), 30);
  if v_username = '' then v_username := 'user'; end if;

  if exists (select 1 from public.profiles where username = v_username) then
    v_username := left(v_username, 22) || '_' || left(new.id::text, 7);
  end if;

  -- Discord OAuth stores the user's Discord snowflake ID in provider_id / sub
  v_discord_id := coalesce(
    new.raw_user_meta_data->>'provider_id',
    new.raw_user_meta_data->>'sub'
  );

  insert into public.profiles(id, email, role, username, discord_id)
  values (new.id, v_email, v_role, v_username, v_discord_id)
  on conflict (id) do update
    set discord_id = coalesce(excluded.discord_id, profiles.discord_id);

  return new;
end;
$$;

-- ─── 4. Updated ensure_profile_exists — also syncs discord_id ────────────────

create or replace function public.ensure_profile_exists(p_display_name text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email      text;
  v_username   text;
  v_discord_id text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  -- Always try to sync discord_id from identities
  select provider_id into v_discord_id
  from   auth.identities
  where  user_id = auth.uid() and provider = 'discord'
  limit  1;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    if v_discord_id is not null then
      update public.profiles
      set    discord_id = v_discord_id
      where  id = auth.uid() and discord_id is null;
    end if;
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

  insert into public.profiles(id, email, role, username, discord_id)
  values (auth.uid(), v_email, 'customer'::user_role, v_username, v_discord_id)
  on conflict (id) do nothing;
end;
$$;

grant execute on function public.ensure_profile_exists(text) to authenticated;
