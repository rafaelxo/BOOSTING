-- ============================================================
-- EloBoost Platform — Initial Schema
-- ============================================================

-- Enable required extensions
create extension if not exists "pg_trgm"; -- for text search

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

create type user_role as enum ('customer', 'booster', 'admin', 'support');
create type game_slug as enum ('lol', 'valorant', 'tft');
create type service_type as enum ('elo_boost', 'win_boost', 'coaching', 'placement_matches', 'md5');
create type queue_type as enum ('solo_duo', 'flex');
create type order_status as enum (
  'draft', 'awaiting_payment', 'paid', 'awaiting_assignment',
  'assigned', 'in_progress', 'paused', 'awaiting_customer',
  'completed', 'disputed', 'refunded', 'canceled'
);
create type booster_status as enum ('pending', 'under_review', 'approved', 'suspended', 'rejected');
create type payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed');
create type ticket_status as enum ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed');
create type ticket_priority as enum ('low', 'medium', 'high', 'urgent');
create type payout_status as enum ('pending', 'processing', 'paid', 'failed');

-- ─── PROFILES ─────────────────────────────────────────────────────────────────

-- Extends auth.users
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  role        user_role not null default 'customer',
  username    text not null unique,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_email_idx on public.profiles(email);
create index profiles_role_idx on public.profiles(role);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, role, username)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer'),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── CUSTOMER PROFILES ───────────────────────────────────────────────────────

create table public.customer_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references public.profiles(id) on delete cascade,
  display_name        text,
  country             text,
  preferred_language  text default 'en',
  total_orders        integer not null default 0,
  total_spent         numeric(10,2) not null default 0,
  created_at          timestamptz not null default now()
);

create index customer_profiles_user_id_idx on public.customer_profiles(user_id);

-- ─── BOOSTER PROFILES ────────────────────────────────────────────────────────

create table public.booster_profiles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references public.profiles(id) on delete cascade,
  display_name          text not null,
  status                booster_status not null default 'pending',
  bio                   text,
  peak_rank             jsonb,
  current_rank          jsonb,
  games                 game_slug[] not null default '{"lol"}',
  queue_preferences     queue_type[] not null default '{"solo_duo"}',
  region_preferences    text[] not null default '{"NA"}',
  total_completed       integer not null default 0,
  total_earnings        numeric(10,2) not null default 0,
  rating                numeric(3,2) not null default 0,
  rating_count          integer not null default 0,
  is_available          boolean not null default false,
  verified_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index booster_profiles_status_idx on public.booster_profiles(status);
create index booster_profiles_available_idx on public.booster_profiles(is_available) where is_available = true;

-- ─── GAMES ───────────────────────────────────────────────────────────────────

create table public.games (
  id          uuid primary key default gen_random_uuid(),
  slug        game_slug not null unique,
  name        text not null,
  icon_url    text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0
);

insert into public.games (slug, name, is_active, sort_order) values
  ('lol', 'League of Legends', true, 1),
  ('valorant', 'Valorant', false, 2),
  ('tft', 'Teamfight Tactics', false, 3);

-- ─── SERVICES ────────────────────────────────────────────────────────────────

create table public.services (
  id                  uuid primary key default gen_random_uuid(),
  game_id             uuid not null references public.games(id),
  type                service_type not null,
  name                text not null,
  description         text,
  short_description   text,
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  unique(game_id, type)
);

-- Seed LoL services
with lol as (select id from public.games where slug = 'lol')
insert into public.services (game_id, type, name, short_description, sort_order)
select lol.id, unnested.svc_type, unnested.svc_name, unnested.svc_desc, unnested.svc_ord
from lol, (values
  ('elo_boost'::service_type, 'Elo Boost', 'Climb from current to target rank', 1),
  ('win_boost'::service_type, 'Win Boost', 'Buy a set number of wins', 2),
  ('coaching'::service_type, 'Coaching', '1-on-1 coaching with high ELO players', 3),
  ('placement_matches'::service_type, 'Placement Matches', 'Best start to your season', 4)
) as unnested(svc_type, svc_name, svc_desc, svc_ord);

-- ─── SERVICE EXTRAS ───────────────────────────────────────────────────────────

create table public.service_extras (
  id                  uuid primary key default gen_random_uuid(),
  service_id          uuid references public.services(id) on delete cascade,
  name                text not null,
  description         text not null,
  price_modifier      numeric(8,2) not null default 0,
  price_modifier_pct  numeric(5,2) not null default 0,
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  icon                text
);

insert into public.service_extras (name, description, price_modifier, price_modifier_pct, sort_order, icon)
values
  ('Priority Processing', 'Instant assignment to top-rated booster', 0, 15, 1, 'zap'),
  ('Solo Queue Only', 'No duo lobbies', 0, 10, 2, 'trophy'),
  ('Mono Champion', 'Specific champion every game', 0, 5, 3, 'eye'),
  ('Live Stream', 'Private stream of your games', 4.99, 0, 4, 'tv'),
  ('Live Monitoring', 'Staff-monitored order with updates', 2.99, 0, 5, 'radio'),
  ('Appear Offline', 'Invisible on friends list', 0, 0, 6, 'eye-off');

-- ─── ORDERS ───────────────────────────────────────────────────────────────────

create table public.orders (
  id                          uuid primary key default gen_random_uuid(),
  customer_id                 uuid not null references public.profiles(id),
  service_id                  text not null,  -- slug or uuid
  game_id                     text not null,  -- slug or uuid
  status                      order_status not null default 'draft',
  queue_type                  queue_type not null default 'solo_duo',
  server                      text not null,
  current_rank                jsonb not null,
  target_rank                 jsonb,
  wins_purchased              integer,
  sessions_purchased          integer,
  extras                      jsonb not null default '[]',
  base_price                  numeric(10,2) not null,
  extras_price                numeric(10,2) not null default 0,
  total_price                 numeric(10,2) not null,
  estimated_hours             integer,
  customer_notes              text,
  booster_notes               text,
  assigned_booster_id         uuid references public.profiles(id),
  stripe_payment_intent_id    text unique,
  stripe_payment_status       payment_status,
  completed_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index orders_customer_id_idx on public.orders(customer_id);
create index orders_status_idx on public.orders(status);
create index orders_booster_id_idx on public.orders(assigned_booster_id);
create index orders_created_at_idx on public.orders(created_at desc);

-- ─── ORDER STATUS HISTORY ─────────────────────────────────────────────────────

create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status order_status,
  to_status   order_status not null,
  changed_by  uuid not null references public.profiles(id),
  reason      text,
  created_at  timestamptz not null default now()
);

create index order_status_history_order_idx on public.order_status_history(order_id);

-- ─── ORDER MESSAGES (in-order chat) ──────────────────────────────────────────

create table public.order_messages (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id),
  sender_role     user_role not null,
  content         text not null,
  attachment_url  text,
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index order_messages_order_idx on public.order_messages(order_id);
create index order_messages_sender_idx on public.order_messages(sender_id);

-- ─── PAYMENTS ─────────────────────────────────────────────────────────────────

create table public.payments (
  id                            uuid primary key default gen_random_uuid(),
  order_id                      uuid not null references public.orders(id),
  customer_id                   uuid not null references public.profiles(id),
  stripe_payment_intent_id      text not null unique,
  stripe_checkout_session_id    text,
  amount                        numeric(10,2) not null,
  currency                      text not null default 'usd',
  status                        payment_status not null default 'pending',
  payment_method_type           text,
  webhook_event_id              text unique,
  refunded_amount               numeric(10,2) not null default 0,
  metadata                      jsonb not null default '{}',
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index payments_order_idx on public.payments(order_id);
create index payments_customer_idx on public.payments(customer_id);
create index payments_status_idx on public.payments(status);

-- ─── REFUNDS ──────────────────────────────────────────────────────────────────

create table public.refunds (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid not null references public.payments(id),
  order_id          uuid not null references public.orders(id),
  stripe_refund_id  text not null unique,
  amount            numeric(10,2) not null,
  reason            text not null,
  initiated_by      uuid not null references public.profiles(id),
  status            text not null default 'pending',
  created_at        timestamptz not null default now()
);

-- ─── SUPPORT TICKETS ──────────────────────────────────────────────────────────

create table public.support_tickets (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.profiles(id),
  order_id      uuid references public.orders(id),
  assigned_to   uuid references public.profiles(id),
  status        ticket_status not null default 'open',
  priority      ticket_priority not null default 'medium',
  subject       text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index tickets_customer_idx on public.support_tickets(customer_id);
create index tickets_status_idx on public.support_tickets(status);
create index tickets_priority_idx on public.support_tickets(priority);

-- ─── TICKET MESSAGES ──────────────────────────────────────────────────────────

create table public.ticket_messages (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references public.support_tickets(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id),
  sender_role     user_role not null,
  content         text not null,
  is_internal     boolean not null default false,
  attachment_url  text,
  created_at      timestamptz not null default now()
);

create index ticket_messages_ticket_idx on public.ticket_messages(ticket_id);

-- ─── REVIEWS ──────────────────────────────────────────────────────────────────

create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references public.orders(id),
  customer_id   uuid not null references public.profiles(id),
  booster_id    uuid references public.profiles(id),
  rating        smallint not null check (rating between 1 and 5),
  content       text,
  is_public     boolean not null default true,
  is_moderated  boolean not null default false,
  admin_note    text,
  created_at    timestamptz not null default now()
);

create index reviews_booster_idx on public.reviews(booster_id);
create index reviews_public_idx on public.reviews(is_public) where is_public = true;

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}',
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on public.notifications(user_id);
create index notifications_unread_idx on public.notifications(user_id, is_read) where is_read = false;

-- ─── AUDIT LOGS ───────────────────────────────────────────────────────────────

create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid not null references public.profiles(id),
  actor_role    user_role not null,
  action        text not null,
  entity_type   text not null,
  entity_id     text not null,
  diff          jsonb,
  ip_address    inet,
  created_at    timestamptz not null default now()
);

create index audit_logs_actor_idx on public.audit_logs(actor_id);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

-- ─── PAYOUT RECORDS ───────────────────────────────────────────────────────────

create table public.payout_records (
  id                uuid primary key default gen_random_uuid(),
  booster_id        uuid not null references public.profiles(id),
  order_id          uuid not null references public.orders(id),
  gross_amount      numeric(10,2) not null,
  commission_rate   numeric(5,4) not null default 0.25,
  commission_amount numeric(10,2) not null,
  net_amount        numeric(10,2) not null,
  status            payout_status not null default 'pending',
  paid_at           timestamptz,
  created_at        timestamptz not null default now()
);

create index payout_records_booster_idx on public.payout_records(booster_id);
create index payout_records_status_idx on public.payout_records(status);
