-- supabase/migrations/008_drop_requests.sql
-- ============================================================
-- Migration 008: Booster Drop Request feature
-- ============================================================

-- ─── 1. Extend order_status enum ─────────────────────────────
alter type public.order_status add value if not exists 'drop_requested';

-- ─── 2. Add match-result counters to orders ──────────────────
alter table public.orders
  add column if not exists wins_played   integer not null default 0,
  add column if not exists losses_played integer not null default 0;

-- ─── 3. order_drop_requests table ────────────────────────────
create table if not exists public.order_drop_requests (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  booster_id       uuid not null references public.profiles(id),
  reason           text not null,
  wins_at_request  integer not null default 0,
  losses_at_request integer not null default 0,
  penalty_pct      integer not null default 0,
  penalty_amount   numeric(10,2) not null default 0,
  status           text not null default 'pending'
                     check (status in ('pending','approved','rejected')),
  admin_id         uuid references public.profiles(id),
  admin_note       text,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

-- ─── 4. RLS: order_drop_requests ─────────────────────────────
alter table public.order_drop_requests enable row level security;

drop policy if exists "boosters_insert_own_drop_requests" on public.order_drop_requests;
create policy "boosters_insert_own_drop_requests"
  on public.order_drop_requests for insert
  to authenticated
  with check (booster_id = auth.uid());

drop policy if exists "boosters_select_own_drop_requests" on public.order_drop_requests;
create policy "boosters_select_own_drop_requests"
  on public.order_drop_requests for select
  to authenticated
  using (booster_id = auth.uid() or public.is_admin());

drop policy if exists "admins_update_drop_requests" on public.order_drop_requests;
create policy "admins_update_drop_requests"
  on public.order_drop_requests for update
  to authenticated
  using (public.is_admin());

-- ─── 5. RPC: log_match_result ────────────────────────────────
create or replace function public.log_match_result(
  p_order_id uuid,
  p_wins     integer,
  p_losses   integer
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

  if auth.uid() is distinct from v_order.assigned_booster_id then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if v_order.status not in ('in_progress', 'paused') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  update public.orders
  set    wins_played   = p_wins,
         losses_played = p_losses,
         updated_at    = now()
  where  id = p_order_id;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.log_match_result(uuid, integer, integer) to authenticated;

-- ─── 6. RPC: request_order_drop ──────────────────────────────
create or replace function public.request_order_drop(
  p_order_id uuid,
  p_reason   text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order       record;
  v_wins        integer;
  v_losses      integer;
  v_penalty_pct integer;
  v_penalty_amt numeric(10,2);
  v_existing    uuid;
begin
  select id, status, assigned_booster_id, wins_played, losses_played, total_price
  into   v_order
  from   public.orders
  where  id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  if auth.uid() is distinct from v_order.assigned_booster_id then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if v_order.status <> 'in_progress' then
    return jsonb_build_object('success', false, 'error', 'order_not_in_progress');
  end if;

  -- Block if a pending request already exists
  select id into v_existing
  from   public.order_drop_requests
  where  order_id = p_order_id and status = 'pending';

  if found then
    return jsonb_build_object('success', false, 'error', 'drop_request_already_pending');
  end if;

  v_wins   := v_order.wins_played;
  v_losses := v_order.losses_played;

  -- Penalty tiers
  v_penalty_pct := case
    when v_wins = 0         then 0
    when v_wins between 1 and 2 then 10
    else 20
  end;

  v_penalty_amt := round(v_order.total_price * v_penalty_pct / 100.0, 2);

  insert into public.order_drop_requests (
    order_id, booster_id, reason,
    wins_at_request, losses_at_request,
    penalty_pct, penalty_amount
  ) values (
    p_order_id, auth.uid(), p_reason,
    v_wins, v_losses,
    v_penalty_pct, v_penalty_amt
  );

  update public.orders
  set    status = 'drop_requested', updated_at = now()
  where  id = p_order_id;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
  values (p_order_id, 'in_progress', 'drop_requested', auth.uid(), p_reason);

  return jsonb_build_object('success', true, 'penalty_pct', v_penalty_pct, 'penalty_amount', v_penalty_amt);
end;
$$;

grant execute on function public.request_order_drop(uuid, text) to authenticated;

-- ─── 7. RPC: resolve_drop_request ────────────────────────────
create or replace function public.resolve_drop_request(
  p_request_id uuid,
  p_approve    boolean,
  p_admin_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_req   record;
  v_actor record;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select r.id, r.order_id, r.booster_id, r.penalty_amount, r.status
  into   v_req
  from   public.order_drop_requests r
  where  r.id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;

  if v_req.status <> 'pending' then
    return jsonb_build_object('success', false, 'error', 'already_resolved');
  end if;

  select id, role into v_actor from public.profiles where id = auth.uid();

  if p_approve then
    -- Cancel the order
    update public.orders
    set    status = 'cancelled', updated_at = now()
    where  id = v_req.order_id;

    insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
    values (v_req.order_id, 'drop_requested', 'cancelled', auth.uid(), 'Drop request approved');

    -- Deduct penalty from booster earnings
    if v_req.penalty_amount > 0 then
      update public.booster_profiles
      set    total_earnings = greatest(0, total_earnings - v_req.penalty_amount)
      where  user_id = v_req.booster_id;
    end if;

    insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, diff)
    values (
      v_actor.id, v_actor.role, 'drop_request.approved', 'order_drop_request', p_request_id::text,
      jsonb_build_object('order_id', v_req.order_id, 'penalty_amount', v_req.penalty_amount)
    );
  else
    -- Revert order to in_progress
    update public.orders
    set    status = 'in_progress', updated_at = now()
    where  id = v_req.order_id;

    insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
    values (v_req.order_id, 'drop_requested', 'in_progress', auth.uid(), 'Drop request rejected');

    insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, diff)
    values (
      v_actor.id, v_actor.role, 'drop_request.rejected', 'order_drop_request', p_request_id::text,
      jsonb_build_object('order_id', v_req.order_id)
    );
  end if;

  update public.order_drop_requests
  set    status      = case when p_approve then 'approved' else 'rejected' end,
         admin_id    = auth.uid(),
         admin_note  = p_admin_note,
         resolved_at = now()
  where  id = p_request_id;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.resolve_drop_request(uuid, boolean, text) to authenticated;
