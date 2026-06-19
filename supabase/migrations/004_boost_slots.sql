-- ============================================================
-- Migration 004: Boost Slot Limits & Top5 Ranking System
-- All enforcement happens at DB level via security definer RPC
-- ============================================================

-- ─── 1. Schema additions ──────────────────────────────────────────────────────

-- boost_mode: 'solo' = booster plays on customer account
--             'duo'  = booster plays in duo queue WITH the customer
alter table public.orders
  add column if not exists boost_mode text not null default 'solo'
  check (boost_mode in ('solo', 'duo'));

alter table public.booster_profiles
  add column if not exists is_top5 boolean not null default false;

create index if not exists booster_profiles_top5_idx
  on public.booster_profiles(is_top5) where is_top5 = true;

-- ─── 2. Helper: active slot counts for a booster ─────────────────────────────

create or replace function public.booster_active_slot_counts(p_booster_user_id uuid)
returns table(solo_count integer, duo_count integer, total_count integer)
language sql stable security definer
set search_path = public
as $$
  select
    count(*) filter (where boost_mode = 'solo')::integer,
    count(*) filter (where boost_mode = 'duo')::integer,
    count(*)::integer
  from public.orders
  where assigned_booster_id = p_booster_user_id
    and status in ('assigned', 'in_progress', 'paused', 'awaiting_customer');
$$;

-- ─── 3. Check: can a booster accept another order? ───────────────────────────
--
-- Slot rules:
--   Normal booster → max 2 active (max 1 duo)
--   Top5 booster   → max 3 active (max 2 duo)
--
-- All combinations allowed within those limits:
--   Normal: [solo+solo] | [solo+duo]
--   Top5:   [solo+solo+solo] | [solo+solo+duo] | [solo+duo+duo]

create or replace function public.can_booster_accept_order(
  p_booster_user_id uuid,
  p_boost_mode      text
)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_is_top5     boolean;
  v_max_total   integer;
  v_max_duo     integer;
  v_solo_count  integer;
  v_duo_count   integer;
  v_total_count integer;
begin
  select is_top5 into v_is_top5
  from public.booster_profiles
  where user_id = p_booster_user_id
    and status = 'approved';

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'booster_not_approved');
  end if;

  if v_is_top5 then
    v_max_total := 3;
    v_max_duo   := 2;
  else
    v_max_total := 2;
    v_max_duo   := 1;
  end if;

  select solo_count, duo_count, total_count
  into   v_solo_count, v_duo_count, v_total_count
  from   public.booster_active_slot_counts(p_booster_user_id);

  if v_total_count >= v_max_total then
    return jsonb_build_object(
      'allowed',      false,
      'reason',       'slot_limit_reached',
      'solo_count',   v_solo_count,
      'duo_count',    v_duo_count,
      'total_count',  v_total_count,
      'max_total',    v_max_total,
      'max_duo',      v_max_duo,
      'is_top5',      v_is_top5
    );
  end if;

  if p_boost_mode = 'duo' and v_duo_count >= v_max_duo then
    return jsonb_build_object(
      'allowed',      false,
      'reason',       'duo_slot_limit_reached',
      'solo_count',   v_solo_count,
      'duo_count',    v_duo_count,
      'total_count',  v_total_count,
      'max_total',    v_max_total,
      'max_duo',      v_max_duo,
      'is_top5',      v_is_top5
    );
  end if;

  return jsonb_build_object(
    'allowed',      true,
    'solo_count',   v_solo_count,
    'duo_count',    v_duo_count,
    'total_count',  v_total_count,
    'max_total',    v_max_total,
    'max_duo',      v_max_duo,
    'is_top5',      v_is_top5
  );
end;
$$;

-- ─── 4. RPC: atomic accept (slot check + assignment in one transaction) ───────
--
-- Security guarantees:
--   • Caller identity verified: auth.uid() must equal p_booster_user_id
--   • Row locked with FOR UPDATE to prevent two boosters accepting the same job
--   • Status re-checked after lock (optimistic → pessimistic)
--   • Slot check happens inside the same transaction
--   • SECURITY DEFINER bypasses RLS only for this controlled operation

create or replace function public.accept_boost_order(
  p_order_id        uuid,
  p_booster_user_id uuid
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_order record;
  v_check jsonb;
begin
  -- Identity check: prevent a booster from accepting on behalf of another
  if auth.uid() is distinct from p_booster_user_id then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  -- Lock the order row to prevent concurrent accepts
  select id, status, boost_mode
  into   v_order
  from   public.orders
  where  id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  if v_order.status <> 'awaiting_assignment' then
    return jsonb_build_object('success', false, 'error', 'order_no_longer_available');
  end if;

  -- Slot check (inside the locked transaction)
  v_check := public.can_booster_accept_order(p_booster_user_id, v_order.boost_mode);

  if not (v_check->>'allowed')::boolean then
    return jsonb_build_object(
      'success', false,
      'error',   v_check->>'reason',
      'details', v_check
    );
  end if;

  update public.orders
  set
    status              = 'assigned',
    assigned_booster_id = p_booster_user_id,
    updated_at          = now()
  where id = p_order_id;

  return jsonb_build_object('success', true, 'details', v_check);
end;
$$;

-- ─── 5. Top5 monthly ranking ──────────────────────────────────────────────────

create or replace function public.refresh_top5_boosters()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_top5_ids uuid[];
begin
  -- auth.uid() is NULL in trigger context (internal DB call) — allow it.
  -- When called directly via RPC, enforce admin/support role only.
  if auth.uid() is not null and not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'support')
  ) then
    raise exception 'forbidden: admin role required';
  end if;

  select array_agg(sub.user_id) into v_top5_ids
  from (
    select bp.user_id
    from   public.booster_profiles bp
    join   public.orders o on o.assigned_booster_id = bp.user_id
    where  o.status = 'completed'
      and  date_trunc('month', o.completed_at) = date_trunc('month', now())
    group  by bp.user_id
    order  by count(*) desc
    limit  5
  ) sub;

  -- Reset first, then promote (keeps it idempotent)
  update public.booster_profiles set is_top5 = false where is_top5 = true;

  if v_top5_ids is not null and array_length(v_top5_ids, 1) > 0 then
    update public.booster_profiles
    set    is_top5 = true
    where  user_id = any(v_top5_ids);
  end if;
end;
$$;

-- ─── 6. Trigger: refresh top5 every time an order is completed ───────────────

create or replace function public.trg_order_completed_refresh_top5()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'completed'
     and (old.status is distinct from 'completed')
  then
    perform public.refresh_top5_boosters();
  end if;
  return new;
end;
$$;

drop trigger if exists order_completed_refresh_top5 on public.orders;
create trigger order_completed_refresh_top5
  after update on public.orders
  for each row execute function public.trg_order_completed_refresh_top5();

-- ─── 7. Permissions ───────────────────────────────────────────────────────────

grant execute on function public.accept_boost_order(uuid, uuid)       to authenticated;
grant execute on function public.can_booster_accept_order(uuid, text) to authenticated;
grant execute on function public.booster_active_slot_counts(uuid)     to authenticated;
grant execute on function public.refresh_top5_boosters()              to authenticated;
