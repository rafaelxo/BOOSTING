-- ============================================================
-- Migration 005: Security hardening + Stripe column cleanup
-- ============================================================

-- ─── 1. Fix handle_new_user: block admin/support self-assignment ──────────────
--
-- Before: anyone calling signUp({ data: { role: 'admin' } }) would get admin.
-- After:  only 'booster' is accepted from metadata; everything else → 'customer'.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role user_role;
begin
  v_role := case
    when new.raw_user_meta_data->>'role' = 'booster' then 'booster'::user_role
    else 'customer'::user_role
  end;

  insert into public.profiles(id, email, role, username)
  values (
    new.id,
    new.email,
    v_role,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

-- ─── 2. Fix ticket_messages INSERT: verify sender is ticket participant ────────

drop policy if exists "ticket_messages_insert" on public.ticket_messages;

create policy "ticket_messages_insert" on public.ticket_messages
  for insert with check (
    sender_id = auth.uid()
    and (
      exists (
        select 1 from public.support_tickets t
        where t.id = ticket_id
          and (t.customer_id = auth.uid() or t.assigned_to = auth.uid())
      )
      or public.is_admin()
    )
  );

-- ─── 3. Fix order_status_history INSERT: verify changer is order participant ──

drop policy if exists "order_status_history_insert" on public.order_status_history;

create policy "order_status_history_insert" on public.order_status_history
  for insert with check (
    changed_by = auth.uid()
    and (
      exists (
        select 1 from public.orders o
        where o.id = order_id
          and (o.customer_id = auth.uid() or o.assigned_booster_id = auth.uid())
      )
      or public.is_admin()
    )
  );

-- ─── 4. Fix booster_active_slot_counts: restrict to self or admin ─────────────

create or replace function public.booster_active_slot_counts(p_booster_user_id uuid)
returns table(solo_count integer, duo_count integer, total_count integer)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_booster_user_id
     and not exists (
       select 1 from public.profiles
       where id = auth.uid() and role in ('admin', 'support')
     )
  then
    raise exception 'forbidden';
  end if;

  return query
    select
      count(*) filter (where boost_mode = 'solo')::integer,
      count(*) filter (where boost_mode = 'duo')::integer,
      count(*)::integer
    from public.orders
    where assigned_booster_id = p_booster_user_id
      and status in ('assigned', 'in_progress', 'paused', 'awaiting_customer');
end;
$$;

-- ─── 5. Rename Stripe columns → provider-neutral names ───────────────────────

do $$
begin
  -- orders.stripe_payment_intent_id → mp_payment_id
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'stripe_payment_intent_id'
  ) then
    alter table public.orders rename column stripe_payment_intent_id to mp_payment_id;
  end if;

  -- orders.stripe_payment_status → payment_status
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'stripe_payment_status'
  ) then
    alter table public.orders rename column stripe_payment_status to payment_status;
  end if;

  -- payments.stripe_payment_intent_id → mp_payment_id
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name = 'stripe_payment_intent_id'
  ) then
    alter table public.payments rename column stripe_payment_intent_id to mp_payment_id;
  end if;

  -- refunds.stripe_refund_id → mp_refund_id
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'refunds'
      and column_name = 'stripe_refund_id'
  ) then
    alter table public.refunds rename column stripe_refund_id to mp_refund_id;
  end if;
end;
$$;

alter table public.payments drop column if exists stripe_checkout_session_id;
