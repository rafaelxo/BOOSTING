-- ============================================================
-- Migration 007: Backend RPCs + service_extras fix
-- Moves all multi-write operations to atomic SECURITY DEFINER RPCs.
-- Fixes service_extras data (PT descriptions + Duo Boost).
-- ============================================================

-- ─── 1. update_order_status (booster) ────────────────────────────────────────
-- Atomically updates order status + inserts history row in one transaction.

create or replace function public.update_order_status(
  p_order_id   uuid,
  p_new_status text,
  p_reason     text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order record;
begin
  select id, status, assigned_booster_id
  into   v_order
  from   public.orders
  where  id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  if auth.uid() is distinct from v_order.assigned_booster_id
     and not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  update public.orders
  set    status = p_new_status::order_status, updated_at = now()
  where  id = p_order_id;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
  values (p_order_id, v_order.status, p_new_status::order_status, auth.uid(), p_reason);

  return jsonb_build_object('success', true);
end;
$$;

-- ─── 2. admin_override_order_status ──────────────────────────────────────────

create or replace function public.admin_override_order_status(
  p_order_id   uuid,
  p_new_status text,
  p_reason     text default 'Admin override'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order record;
  v_actor record;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select id, status into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  select id, role into v_actor from public.profiles where id = auth.uid();

  update public.orders
  set    status = p_new_status::order_status, updated_at = now()
  where  id = p_order_id;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
  values (p_order_id, v_order.status, p_new_status::order_status, auth.uid(), p_reason);

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, diff)
  values (
    v_actor.id, v_actor.role, 'order.status_override', 'order', p_order_id::text,
    jsonb_build_object('from', v_order.status, 'to', p_new_status)
  );

  return jsonb_build_object('success', true);
end;
$$;

-- ─── 3. approve_booster ──────────────────────────────────────────────────────

create or replace function public.approve_booster(
  p_booster_id uuid,
  p_new_status text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_actor record;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select id, role into v_actor from public.profiles where id = auth.uid();

  update public.booster_profiles
  set
    status      = p_new_status::booster_status,
    verified_at = case when p_new_status = 'approved' then now() else null end,
    updated_at  = now()
  where id = p_booster_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'booster_not_found');
  end if;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id)
  values (v_actor.id, v_actor.role, 'booster.' || p_new_status, 'booster_profile', p_booster_id::text);

  return jsonb_build_object('success', true);
end;
$$;

-- ─── 4. toggle_booster_top5 ──────────────────────────────────────────────────

create or replace function public.toggle_booster_top5(
  p_booster_id uuid,
  p_is_top5    boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_actor record;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select id, role into v_actor from public.profiles where id = auth.uid();

  update public.booster_profiles
  set is_top5 = p_is_top5, updated_at = now()
  where id = p_booster_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'booster_not_found');
  end if;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id)
  values (
    v_actor.id, v_actor.role,
    case when p_is_top5 then 'booster.top5_granted' else 'booster.top5_removed' end,
    'booster_profile', p_booster_id::text
  );

  return jsonb_build_object('success', true);
end;
$$;

-- ─── 5. assign_ticket ────────────────────────────────────────────────────────

create or replace function public.assign_ticket(
  p_ticket_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  update public.support_tickets
  set assigned_to = auth.uid(), status = 'in_progress', updated_at = now()
  where id = p_ticket_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'ticket_not_found');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

-- ─── 6. moderate_review ──────────────────────────────────────────────────────

create or replace function public.moderate_review(
  p_review_id uuid,
  p_is_public  boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_actor record;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select id, role into v_actor from public.profiles where id = auth.uid();

  update public.reviews
  set is_public = p_is_public, is_moderated = true
  where id = p_review_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'review_not_found');
  end if;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, diff)
  values (
    v_actor.id, v_actor.role, 'review.moderated', 'review', p_review_id::text,
    jsonb_build_object('is_public', p_is_public)
  );

  return jsonb_build_object('success', true);
end;
$$;

-- ─── 7. onboard_booster ──────────────────────────────────────────────────────
-- Prevents frontend from setting backend-controlled fields (total_completed,
-- total_earnings, rating, rating_count, is_available).

create or replace function public.onboard_booster(
  p_display_name text,
  p_bio          text,
  p_games        text[],
  p_regions      text[],
  p_peak_rank    jsonb
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
    games, region_preferences, queue_preferences, peak_rank
  )
  values (
    auth.uid(), p_display_name, nullif(p_bio, ''), 'pending',
    p_games::text[], p_regions,
    array['solo_duo', 'flex']::queue_type[], p_peak_rank
  )
  on conflict (user_id) do update set
    display_name        = excluded.display_name,
    bio                 = excluded.bio,
    games               = excluded.games,
    region_preferences  = excluded.region_preferences,
    peak_rank           = excluded.peak_rank,
    updated_at          = now();

  return jsonb_build_object('success', true);
end;
$$;

-- ─── 8. update_my_username ────────────────────────────────────────────────────

create or replace function public.update_my_username(
  p_username text
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.profiles
    where username = p_username and id <> auth.uid()
  ) then
    return jsonb_build_object('success', false, 'error', 'username_taken');
  end if;

  update public.profiles
  set username = p_username, updated_at = now()
  where id = auth.uid();

  return jsonb_build_object('success', true);
end;
$$;

-- ─── 9. Grants ───────────────────────────────────────────────────────────────

grant execute on function public.update_order_status(uuid, text, text)           to authenticated;
grant execute on function public.admin_override_order_status(uuid, text, text)   to authenticated;
grant execute on function public.approve_booster(uuid, text)                     to authenticated;
grant execute on function public.toggle_booster_top5(uuid, boolean)              to authenticated;
grant execute on function public.assign_ticket(uuid)                             to authenticated;
grant execute on function public.moderate_review(uuid, boolean)                  to authenticated;
grant execute on function public.onboard_booster(text, text, text[], text[], jsonb) to authenticated;
grant execute on function public.update_my_username(text)                        to authenticated;

-- ─── 10. service_extras: fix data (PT descriptions + add Duo Boost) ──────────

delete from public.service_extras;

insert into public.service_extras (name, description, price_modifier, price_modifier_pct, sort_order, icon, is_active)
values
  ('Duo Boost',          'Jogue ao lado do seu booster em duo queue. +52% sobre o valor base.',           0,    52, 1, 'users',    true),
  ('Priority Processing','Atribuição imediata ao booster mais bem avaliado. Início mais rápido.',         0,    15, 2, 'zap',      true),
  ('Solo Queue Only',    'O booster joga apenas SoloQ. Sem duo ou flex.',                                  0,    10, 3, 'trophy',   true),
  ('Mono Champion',      'Seu campeão favorito em cada partida. Especifique nas observações.',             0,     5, 4, 'eye',      true),
  ('Live Stream',        'Assista seu booster via link de stream privado.',                                4.99,  0, 5, 'tv',       true),
  ('Live Monitoring',    'Nossa equipe monitora seu pedido e envia atualizações periódicas.',              2.99,  0, 6, 'radio',    true),
  ('Appear Offline',     'Sua conta fica offline durante todo o serviço.',                                 0,     0, 7, 'eye-off',  true);

-- ─── 11. service_extras RLS (idempotent) ─────────────────────────────────────

drop policy if exists "service_extras_public_read" on public.service_extras;
drop policy if exists "service_extras_admin_write" on public.service_extras;

create policy "service_extras_public_read" on public.service_extras
  for select using (is_active = true or public.is_admin());

create policy "service_extras_admin_write" on public.service_extras
  for all using (public.is_admin());
