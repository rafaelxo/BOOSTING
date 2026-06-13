-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.booster_profiles enable row level security;
alter table public.games enable row level security;
alter table public.services enable row level security;
alter table public.service_extras enable row level security;
alter table public.orders enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_messages enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.payout_records enable row level security;

-- ─── Helper functions ─────────────────────────────────────────────────────────

-- Get current user's role
create or replace function public.current_user_role()
returns user_role language sql stable security definer as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Check if current user is admin or support
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'support')
  )
$$;

-- ─── PROFILES ─────────────────────────────────────────────────────────────────

create policy "profiles_read_own" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- ─── CUSTOMER PROFILES ───────────────────────────────────────────────────────

create policy "customer_profiles_read_own" on public.customer_profiles
  for select using (user_id = auth.uid() or public.is_admin());

create policy "customer_profiles_update_own" on public.customer_profiles
  for update using (user_id = auth.uid());

create policy "customer_profiles_insert_own" on public.customer_profiles
  for insert with check (user_id = auth.uid());

-- ─── BOOSTER PROFILES ────────────────────────────────────────────────────────

create policy "booster_profiles_read_own_or_admin" on public.booster_profiles
  for select using (user_id = auth.uid() or public.is_admin());

create policy "booster_profiles_insert_own" on public.booster_profiles
  for insert with check (user_id = auth.uid());

create policy "booster_profiles_update_own_or_admin" on public.booster_profiles
  for update using (user_id = auth.uid() or public.is_admin());

-- ─── GAMES & SERVICES (public read) ──────────────────────────────────────────

create policy "games_public_read" on public.games
  for select using (is_active = true or public.is_admin());

create policy "games_admin_write" on public.games
  for all using (public.is_admin());

create policy "services_public_read" on public.services
  for select using (is_active = true or public.is_admin());

create policy "services_admin_write" on public.services
  for all using (public.is_admin());

create policy "service_extras_public_read" on public.service_extras
  for select using (is_active = true or public.is_admin());

create policy "service_extras_admin_write" on public.service_extras
  for all using (public.is_admin());

-- ─── ORDERS ───────────────────────────────────────────────────────────────────

-- Customers see only their own orders
create policy "orders_customer_read" on public.orders
  for select using (
    customer_id = auth.uid()
    or assigned_booster_id = auth.uid()
    or public.is_admin()
  );

create policy "orders_customer_insert" on public.orders
  for insert with check (customer_id = auth.uid());

-- Customers can update only draft orders; boosters update assigned orders; admins update all
create policy "orders_update" on public.orders
  for update using (
    (customer_id = auth.uid() and status = 'draft')
    or assigned_booster_id = auth.uid()
    or public.is_admin()
  );

-- ─── ORDER MESSAGES ───────────────────────────────────────────────────────────

-- Participants of the order can read its messages
create policy "order_messages_read" on public.order_messages
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or o.assigned_booster_id = auth.uid())
    )
    or public.is_admin()
  );

create policy "order_messages_insert" on public.order_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or o.assigned_booster_id = auth.uid())
    )
  );

-- ─── ORDER STATUS HISTORY ────────────────────────────────────────────────────

create policy "order_status_history_read" on public.order_status_history
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or o.assigned_booster_id = auth.uid())
    )
    or public.is_admin()
  );

create policy "order_status_history_insert" on public.order_status_history
  for insert with check (changed_by = auth.uid());

-- ─── PAYMENTS ─────────────────────────────────────────────────────────────────

-- Customers see their own payments; admins see all
create policy "payments_read" on public.payments
  for select using (customer_id = auth.uid() or public.is_admin());

-- Payments are created by Edge Functions (service_role), not directly by clients
create policy "payments_admin_all" on public.payments
  for all using (public.is_admin());

-- ─── REFUNDS ──────────────────────────────────────────────────────────────────

create policy "refunds_read" on public.refunds
  for select using (
    exists (select 1 from public.payments p where p.id = payment_id and p.customer_id = auth.uid())
    or public.is_admin()
  );

-- ─── SUPPORT TICKETS ──────────────────────────────────────────────────────────

create policy "tickets_customer_read" on public.support_tickets
  for select using (customer_id = auth.uid() or public.is_admin());

create policy "tickets_customer_insert" on public.support_tickets
  for insert with check (customer_id = auth.uid());

create policy "tickets_update" on public.support_tickets
  for update using (customer_id = auth.uid() or public.is_admin());

-- ─── TICKET MESSAGES ──────────────────────────────────────────────────────────

create policy "ticket_messages_read" on public.ticket_messages
  for select using (
    (
      exists (
        select 1 from public.support_tickets t
        where t.id = ticket_id and t.customer_id = auth.uid()
      )
      and is_internal = false
    )
    or public.is_admin()
  );

create policy "ticket_messages_insert" on public.ticket_messages
  for insert with check (sender_id = auth.uid());

-- ─── REVIEWS ──────────────────────────────────────────────────────────────────

-- Public reviews visible to all; customers see their own unpublished
create policy "reviews_public_read" on public.reviews
  for select using (
    is_public = true
    or customer_id = auth.uid()
    or public.is_admin()
  );

create policy "reviews_customer_insert" on public.reviews
  for insert with check (
    customer_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.customer_id = auth.uid()
        and o.status = 'completed'
    )
  );

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

create policy "notifications_read_own" on public.notifications
  for select using (user_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid());

-- ─── AUDIT LOGS ───────────────────────────────────────────────────────────────

-- Only admins can read audit logs
create policy "audit_logs_admin_read" on public.audit_logs
  for select using (public.is_admin());

-- Any authenticated user can insert audit events
create policy "audit_logs_insert" on public.audit_logs
  for insert with check (actor_id = auth.uid());

-- ─── PAYOUT RECORDS ───────────────────────────────────────────────────────────

create policy "payout_records_read" on public.payout_records
  for select using (booster_id = auth.uid() or public.is_admin());
