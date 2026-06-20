-- ============================================================
-- Migration 012: Add personal/PIX fields to booster_profiles
-- ============================================================

alter table public.booster_profiles
  add column if not exists full_name text,
  add column if not exists email     text,
  add column if not exists phone     text,
  add column if not exists cpf       text;

-- Updated RPC: include personal fields
create or replace function public.onboard_booster(
  p_display_name      text,
  p_bio               text,
  p_peak_rank         jsonb,
  p_opgg_link         text    default null,
  p_hours_per_day_min integer default null,
  p_hours_per_day_max integer default null,
  p_full_name         text    default null,
  p_email             text    default null,
  p_phone             text    default null,
  p_cpf               text    default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role user_role;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if v_role is distinct from 'booster' then
    return jsonb_build_object('success', false, 'error', 'not_a_booster');
  end if;

  insert into public.booster_profiles(
    user_id, display_name, bio, status,
    peak_rank, opgg_link, hours_per_day_min, hours_per_day_max,
    full_name, email, phone, cpf
  )
  values (
    auth.uid(), p_display_name, nullif(p_bio, ''), 'pending',
    p_peak_rank, nullif(p_opgg_link, ''), p_hours_per_day_min, p_hours_per_day_max,
    nullif(p_full_name, ''), nullif(p_email, ''), nullif(p_phone, ''), nullif(p_cpf, '')
  )
  on conflict (user_id) do update set
    display_name        = excluded.display_name,
    bio                 = excluded.bio,
    peak_rank           = excluded.peak_rank,
    opgg_link           = excluded.opgg_link,
    hours_per_day_min   = excluded.hours_per_day_min,
    hours_per_day_max   = excluded.hours_per_day_max,
    full_name           = excluded.full_name,
    email               = excluded.email,
    phone               = excluded.phone,
    cpf                 = excluded.cpf,
    updated_at          = now();

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.onboard_booster(text, text, jsonb, text, integer, integer, text, text, text, text) to authenticated;
