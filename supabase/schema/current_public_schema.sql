


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."booster_status" AS ENUM (
    'pending',
    'under_review',
    'approved',
    'suspended',
    'rejected'
);


ALTER TYPE "public"."booster_status" OWNER TO "postgres";


CREATE TYPE "public"."order_status" AS ENUM (
    'draft',
    'awaiting_payment',
    'paid',
    'awaiting_assignment',
    'assigned',
    'in_progress',
    'paused',
    'drop_requested',
    'awaiting_customer',
    'completed',
    'disputed',
    'refunded',
    'canceled'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'paid',
    'failed',
    'refunded',
    'partially_refunded',
    'disputed'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."payout_status" AS ENUM (
    'pending',
    'processing',
    'paid',
    'failed'
);


ALTER TYPE "public"."payout_status" OWNER TO "postgres";


CREATE TYPE "public"."queue_type" AS ENUM (
    'solo_duo',
    'flex'
);


ALTER TYPE "public"."queue_type" OWNER TO "postgres";


CREATE TYPE "public"."service_type" AS ENUM (
    'elo_boost',
    'win_boost',
    'coaching',
    'placement_matches',
    'md5'
);


ALTER TYPE "public"."service_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'customer',
    'booster',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_boost_order"("p_order_id" "uuid", "p_booster_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order record;
  v_check jsonb;
  v_is_exclusive boolean;
begin
  if auth.uid() is distinct from p_booster_user_id then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_booster_user_id::text, 0));

  select id, status, boost_mode, preferred_booster_id, exclusive_until,
         service_type, credentials_set
  into v_order
  from public.orders where id = p_order_id for update;

  if not found then return jsonb_build_object('success', false, 'error', 'order_not_found'); end if;
  if v_order.status <> 'awaiting_assignment' then
    return jsonb_build_object('success', false, 'error', 'order_no_longer_available');
  end if;
  if public.order_requires_access_token(v_order.service_type, v_order.boost_mode)
     and not v_order.credentials_set then
    return jsonb_build_object('success', false, 'error', 'missing_access_token');
  end if;
  if v_order.preferred_booster_id is not null
     and v_order.exclusive_until is not null
     and v_order.exclusive_until > now()
     and v_order.preferred_booster_id <> p_booster_user_id then
    return jsonb_build_object('success', false, 'error', 'order_exclusive_to_another_booster');
  end if;

  v_is_exclusive := v_order.preferred_booster_id is not null
    and v_order.preferred_booster_id = p_booster_user_id
    and v_order.exclusive_until is not null
    and v_order.exclusive_until > now();

  if v_is_exclusive then
    if public.booster_has_active_exclusive_slot(p_booster_user_id) then
      return jsonb_build_object('success', false, 'error', 'exclusive_slot_already_used');
    end if;

    update public.orders
    set status = 'assigned', assigned_booster_id = p_booster_user_id, used_exclusive_slot = true, updated_at = now()
    where id = p_order_id;

    return jsonb_build_object('success', true, 'details', jsonb_build_object('used_exclusive_slot', true));
  end if;

  v_check := public.can_booster_accept_order(p_booster_user_id, v_order.boost_mode);
  if not (v_check->>'allowed')::boolean then
    return jsonb_build_object('success', false, 'error', v_check->>'reason', 'details', v_check);
  end if;

  update public.orders
  set status = 'assigned', assigned_booster_id = p_booster_user_id, updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('success', true, 'details', v_check);
end;
$$;


ALTER FUNCTION "public"."accept_boost_order"("p_order_id" "uuid", "p_booster_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_dashboard_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_total_revenue numeric;
  v_active_orders integer;
  v_pending_boosters integer;
  v_recent_orders jsonb;
  v_daily_orders jsonb;
begin
  if not public.is_admin() then
    raise exception 'unauthorized';
  end if;

  select coalesce(sum(amount), 0) into v_total_revenue
  from public.payments where status = 'paid';

  select count(*) into v_active_orders
  from public.orders where status in ('assigned', 'in_progress', 'paused');

  select count(*) into v_pending_boosters
  from public.booster_profiles where status in ('pending', 'under_review');

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_recent_orders from (
    select id, status, total_price, created_at
    from public.orders
    order by created_at desc
    limit 8
  ) t;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_daily_orders from (
    select gs::date as day, count(o.id) as count
    from generate_series(current_date - interval '6 days', current_date, interval '1 day') gs
    left join public.orders o on o.created_at::date = gs::date
    group by gs
    order by gs
  ) t;

  return jsonb_build_object(
    'total_revenue', v_total_revenue,
    'active_orders_count', v_active_orders,
    'pending_boosters_count', v_pending_boosters,
    'recent_orders', v_recent_orders,
    'daily_orders', v_daily_orders
  );
end;
$$;


ALTER FUNCTION "public"."admin_dashboard_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_override_order_status"("p_order_id" "uuid", "p_new_status" "text", "p_reason" "text" DEFAULT 'Admin override'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order record;
  v_actor record;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select id, status into v_order from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'order_not_found'); end if;

  select id, role into v_actor from public.profiles where id = auth.uid();

  update public.orders set status = p_new_status::public.order_status, updated_at = now()
  where  id = p_order_id;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
  values (p_order_id, v_order.status, p_new_status::public.order_status, auth.uid(), p_reason);

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, diff)
  values (v_actor.id, v_actor.role, 'order.status_override', 'order', p_order_id::text,
          jsonb_build_object('from', v_order.status, 'to', p_new_status));

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."admin_override_order_status"("p_order_id" "uuid", "p_new_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_order_chat_lock"("p_order_id" "uuid", "p_locked" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated', 'message', 'Sessao nao autenticada.');
  end if;

  if not public.is_admin() then
    return jsonb_build_object('success', false, 'code', 'forbidden', 'message', 'Apenas administradores podem controlar o chat.');
  end if;

  update public.orders
  set chat_locked = p_locked,
      chat_locked_by = case when p_locked then v_user_id else null end,
      chat_locked_at = case when p_locked then now() else null end,
      updated_at = now()
  where id = p_order_id;

  if not found then
    return jsonb_build_object('success', false, 'code', 'order_not_found', 'message', 'Pedido nao encontrado.');
  end if;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, diff)
  values (
    v_user_id,
    'admin'::public.user_role,
    case when p_locked then 'order_chat_locked' else 'order_chat_unlocked' end,
    'order',
    p_order_id,
    jsonb_build_object('chat_locked', p_locked)
  );

  return jsonb_build_object('success', true, 'chat_locked', p_locked);
end;
$$;


ALTER FUNCTION "public"."admin_set_order_chat_lock"("p_order_id" "uuid", "p_locked" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_booster"("p_booster_id" "uuid", "p_new_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_actor record;
  v_booster_user_id uuid;
  v_status public.booster_status;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  v_status := p_new_status::public.booster_status;

  select id, role into v_actor from public.profiles where id = auth.uid();

  update public.booster_profiles
  set    status      = v_status,
         verified_at = case when v_status = 'approved' then now() else null end,
         updated_at  = now()
  where  id = p_booster_id
  returning user_id into v_booster_user_id;

  if not found then return jsonb_build_object('success', false, 'error', 'booster_not_found'); end if;

  update public.profiles
  set role = case when v_status = 'approved' then 'booster'::public.user_role else 'customer'::public.user_role end,
      updated_at = now()
  where id = v_booster_user_id
    and role <> 'admin';

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id)
  values (v_actor.id, v_actor.role, 'booster.' || v_status::text, 'booster_profile', p_booster_id::text);

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."approve_booster"("p_booster_id" "uuid", "p_new_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."booster_active_slot_counts"("p_booster_user_id" "uuid") RETURNS TABLE("solo_count" integer, "duo_count" integer, "total_count" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if auth.uid() is distinct from p_booster_user_id and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return query
    select
      count(*) filter (where boost_mode = 'solo')::integer,
      count(*) filter (where boost_mode = 'duo')::integer,
      count(*)::integer
    from public.orders
    where assigned_booster_id = p_booster_user_id
      and status in ('assigned', 'in_progress', 'paused', 'awaiting_customer')
      and not used_exclusive_slot;
end;
$$;


ALTER FUNCTION "public"."booster_active_slot_counts"("p_booster_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."booster_heartbeat"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  update public.booster_profiles
     set last_active_at = now()
   where user_id = auth.uid()
     and status = 'approved';
$$;


ALTER FUNCTION "public"."booster_heartbeat"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."booster_has_active_exclusive_slot"("p_booster_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if auth.uid() is distinct from p_booster_user_id and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return exists (
    select 1 from public.orders
    where assigned_booster_id = p_booster_user_id
      and status in ('assigned', 'in_progress', 'paused', 'awaiting_customer')
      and used_exclusive_slot
  );
end;
$$;


ALTER FUNCTION "public"."booster_has_active_exclusive_slot"("p_booster_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."booster_payout_summary"("p_booster_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_total_earned numeric;
  v_total_withdrawn numeric;
  v_available numeric;
  v_processing numeric;
begin
  if auth.uid() is distinct from p_booster_user_id and not public.is_admin() then
    raise exception 'unauthorized';
  end if;

  select
    coalesce(sum(net_amount), 0),
    coalesce(sum(net_amount) filter (where status = 'paid'), 0),
    coalesce(sum(net_amount) filter (where status = 'pending'), 0),
    coalesce(sum(net_amount) filter (where status = 'processing'), 0)
  into v_total_earned, v_total_withdrawn, v_available, v_processing
  from public.payout_records
  where booster_id = p_booster_user_id;

  return jsonb_build_object(
    'total_earned', v_total_earned,
    'total_withdrawn', v_total_withdrawn,
    'available', v_available,
    'processing', v_processing
  );
end;
$$;


ALTER FUNCTION "public"."booster_payout_summary"("p_booster_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_booster_accept_order"("p_booster_user_id" "uuid", "p_boost_mode" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_is_top5         boolean;
  v_max_total       integer;
  v_max_duo         integer;
  v_solo_count      integer;
  v_duo_count       integer;
  v_total_count     integer;
  v_exclusive_used  boolean;
begin
  select is_top5 into v_is_top5
  from public.booster_profiles
  where user_id = p_booster_user_id and status = 'approved';

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'booster_not_approved');
  end if;

  if v_is_top5 then
    v_max_total := 3; v_max_duo := 2;
  else
    v_max_total := 3; v_max_duo := 1;
  end if;

  select solo_count, duo_count, total_count
  into   v_solo_count, v_duo_count, v_total_count
  from   public.booster_active_slot_counts(p_booster_user_id);

  v_exclusive_used := public.booster_has_active_exclusive_slot(p_booster_user_id);

  if v_total_count >= v_max_total then
    return jsonb_build_object(
      'allowed', false, 'reason', 'slot_limit_reached',
      'solo_count', v_solo_count, 'duo_count', v_duo_count,
      'total_count', v_total_count, 'max_total', v_max_total,
      'max_duo', v_max_duo, 'is_top5', v_is_top5,
      'exclusive_slot_used', v_exclusive_used, 'max_exclusive', 1
    );
  end if;

  if p_boost_mode = 'duo' and v_duo_count >= v_max_duo then
    return jsonb_build_object(
      'allowed', false, 'reason', 'duo_slot_limit_reached',
      'solo_count', v_solo_count, 'duo_count', v_duo_count,
      'total_count', v_total_count, 'max_total', v_max_total,
      'max_duo', v_max_duo, 'is_top5', v_is_top5,
      'exclusive_slot_used', v_exclusive_used, 'max_exclusive', 1
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'solo_count', v_solo_count, 'duo_count', v_duo_count,
    'total_count', v_total_count, 'max_total', v_max_total,
    'max_duo', v_max_duo, 'is_top5', v_is_top5,
    'exclusive_slot_used', v_exclusive_used, 'max_exclusive', 1
  );
end;
$$;


ALTER FUNCTION "public"."can_booster_accept_order"("p_booster_user_id" "uuid", "p_boost_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_own_write_rate_limit"("p_scope" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    return false;
  end if;
  v_result := public.consume_edge_rate_limit(p_scope, v_uid::text, p_limit, p_window_seconds);
  return coalesce((v_result->>'allowed')::boolean, false);
end;
$$;


ALTER FUNCTION "public"."check_own_write_rate_limit"("p_scope" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_terminal_order_credentials"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if new.status in ('completed', 'canceled', 'refunded', 'disputed')
     or new.payment_status is distinct from 'paid'::public.payment_status then
    new.game_credentials := null;
    new.credentials_set := false;
    new.credential_expires_at := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."clear_terminal_order_credentials"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_verified_order"("p_order_id" "uuid", "p_fetched_tier" "text", "p_fetched_division" "text", "p_requested_by" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order record;
  v_target_tier text;
  v_target_division text;
begin
  select id, status, customer_id, assigned_booster_id, target_rank into v_order
  from public.orders where id = p_order_id for update;

  if not found then return jsonb_build_object('success', false, 'error', 'order_not_found'); end if;
  if v_order.assigned_booster_id is distinct from p_requested_by then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  if v_order.status not in ('in_progress', 'paused', 'awaiting_customer') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;
  if v_order.target_rank is null then
    return jsonb_build_object('success', false, 'error', 'no_target_rank');
  end if;

  v_target_tier := v_order.target_rank->>'tier';
  v_target_division := v_order.target_rank->>'division';

  -- rank_step() returns null for an unrecognized tier — never let that
  -- resolve to a passing "not less than" comparison (null < x is null,
  -- i.e. neither true nor false; treat unmappable data as a hard fail).
  if public.rank_step(p_fetched_tier, p_fetched_division) is null
     or public.rank_step(v_target_tier, v_target_division) is null then
    return jsonb_build_object('success', false, 'error', 'invalid_rank_data');
  end if;

  if public.rank_step(p_fetched_tier, p_fetched_division) < public.rank_step(v_target_tier, v_target_division) then
    return jsonb_build_object('success', false, 'error', 'target_not_reached');
  end if;

  update public.orders set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_order_id;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
  values (p_order_id, v_order.status, 'completed', p_requested_by, 'Rank alvo verificado via Riot API');

  insert into public.notifications(user_id, type, title, body, data)
  values (v_order.customer_id, 'order_completed', 'Pedido concluído!',
          'Verificamos que sua conta atingiu o rank alvo. Seu pedido foi concluído.',
          jsonb_build_object('order_id', p_order_id));

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."complete_verified_order"("p_order_id" "uuid", "p_fetched_tier" "text", "p_fetched_division" "text", "p_requested_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_edge_rate_limit"("p_scope" "text", "p_subject" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $_$
declare
  v_row public.edge_rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_scope !~ '^[a-z0-9_-]{1,64}$' or char_length(p_subject) > 128
     or p_limit < 1 or p_limit > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit configuration';
  end if;

  insert into public.edge_rate_limits(scope, subject, window_started_at, request_count)
  values (p_scope, p_subject, v_now, 1)
  on conflict (scope, subject) do update set
    window_started_at = case
      when edge_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now
      else edge_rate_limits.window_started_at
    end,
    request_count = case
      when edge_rate_limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1
      else edge_rate_limits.request_count + 1
    end
  returning * into v_row;

  return jsonb_build_object(
    'allowed', v_row.request_count <= p_limit,
    'retry_after', greatest(1, ceil(extract(epoch from (
      v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now
    )))::integer)
  );
end;
$_$;


ALTER FUNCTION "public"."consume_edge_rate_limit"("p_scope" "text", "p_subject" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select role from public.profiles where id = auth.uid()
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_profile_exists"("p_display_name" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_email      text;
  v_username   text;
  v_discord_id text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

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
  values (auth.uid(), v_email, 'customer'::public.user_role, v_username, v_discord_id)
  on conflict (id) do nothing;
end;
$$;


ALTER FUNCTION "public"."ensure_profile_exists"("p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_stale_pix_orders"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  update public.orders
  set status = 'canceled', updated_at = now()
  where status = 'awaiting_payment'
    and created_at < now() - interval '35 minutes';
end;
$$;


ALTER FUNCTION "public"."expire_stale_pix_orders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_duo_account_credentials"("p_account_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_account   record;
  v_key       text;
  v_decrypted text;
  v_parts     text[];
  v_is_booster boolean;
begin
  select id, is_active, encrypted_credentials
  into   v_account
  from   public.duo_accounts
  where  id = p_account_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'account_not_found');
  end if;

  select exists (
    select 1 from public.booster_profiles
    where user_id = auth.uid() and status = 'approved'
  ) into v_is_booster;

  if not public.is_admin() and not v_is_booster then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if not v_account.is_active and not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'account_inactive');
  end if;

  if v_account.encrypted_credentials is null then
    return jsonb_build_object('success', false, 'error', 'no_credentials');
  end if;

  select decrypted_secret into v_key
  from   vault.decrypted_secrets
  where  name = 'credential_key'
  limit  1;

  if v_key is null or length(v_key) < 32 then
    return jsonb_build_object('success', false, 'error', 'server_key_not_configured');
  end if;

  begin
    v_decrypted := pgp_sym_decrypt(v_account.encrypted_credentials::bytea, v_key);
  exception when others then
    return jsonb_build_object('success', false, 'error', 'decrypt_failed');
  end;

  v_parts := string_to_array(v_decrypted, '|');

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id)
  values (auth.uid(), public.current_user_role(), 'duo_account.credentials_viewed', 'duo_account', p_account_id::text);

  return jsonb_build_object(
    'success', true,
    'login',    v_parts[1],
    'password', v_parts[2]
  );
end;
$$;


ALTER FUNCTION "public"."get_duo_account_credentials"("p_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_order_chat"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_order public.orders%rowtype;
  v_messages jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated', 'message', 'Sessao nao autenticada.');
  end if;

  v_role := public.current_user_role();
  if v_role is null then
    return jsonb_build_object('success', false, 'code', 'profile_not_found', 'message', 'Perfil de usuario nao encontrado.');
  end if;

  select * into v_order from public.orders where id = p_order_id;

  if not found or not (
    v_role = 'admin'::public.user_role
    or v_order.customer_id = v_user_id
    or v_order.assigned_booster_id = v_user_id
  ) then
    return jsonb_build_object('success', false, 'code', 'order_not_found', 'message', 'Pedido nao encontrado.');
  end if;

  if v_order.assigned_booster_id is not null then
    select coalesce(jsonb_agg(row_data order by row_data->>'created_at'), '[]'::jsonb)
    into v_messages
    from (
      select jsonb_build_object(
        'id', m.id,
        'order_id', m.order_id,
        'sender_id', m.sender_id,
        'sender_role', m.sender_role,
        'sender_name', case
          when m.sender_role = 'admin'::public.user_role then coalesce(p.username, 'Administrador')
          when m.sender_role = 'booster'::public.user_role then coalesce(bp.display_name, p.username, 'Booster')
          else coalesce(p.username, 'Cliente')
        end,
        'sender_avatar_url', p.avatar_url,
        'content', m.content,
        'created_at', m.created_at
      ) as row_data
      from (
        select om.*
        from public.order_messages om
        where om.order_id = p_order_id
        order by om.created_at desc
        limit 300
      ) m
      join public.profiles p on p.id = m.sender_id
      left join public.booster_profiles bp
        on bp.user_id = m.sender_id
       and m.sender_role = 'booster'::public.user_role
    ) messages;
  end if;

  return jsonb_build_object(
    'success', true,
    'chat_available', v_order.assigned_booster_id is not null,
    'chat_locked', v_order.chat_locked,
    'chat_locked_at', v_order.chat_locked_at,
    'can_send',
      v_order.assigned_booster_id is not null
      and (v_role = 'admin'::public.user_role or not v_order.chat_locked),
    'messages', v_messages
  );
end;
$$;


ALTER FUNCTION "public"."get_order_chat"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_order_state"("p_order_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid := auth.uid();
  v_order record;
  v_requires_credentials boolean;
  v_is_active_paid boolean;
begin
  if v_customer_id is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_order_id is null then
    select id, status, payment_status, service_type, boost_mode, credentials_set
    into v_order
    from public.orders
    where customer_id = v_customer_id and status = 'awaiting_payment'
    order by created_at desc limit 1;
    if not found then
      return jsonb_build_object('success', true, 'order_id', null);
    end if;
  else
    select id, status, payment_status, service_type, boost_mode, credentials_set
    into v_order
    from public.orders
    where id = p_order_id and customer_id = v_customer_id;
    if not found then
      return jsonb_build_object('success', false, 'error', 'order_not_found');
    end if;
  end if;

  v_requires_credentials := public.order_requires_access_token(v_order.service_type, v_order.boost_mode);
  v_is_active_paid := v_order.payment_status = 'paid'::public.payment_status
    and v_order.status in ('awaiting_assignment', 'assigned', 'in_progress', 'paused', 'awaiting_customer');

  return jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'can_pay', v_order.status = 'awaiting_payment'
      and coalesce(v_order.payment_status, 'pending'::public.payment_status) = 'pending'::public.payment_status,
    'payment_confirmed', v_is_active_paid,
    'requires_credentials', v_requires_credentials,
    'credentials_set', v_order.credentials_set,
    'can_submit_credentials', v_is_active_paid and v_requires_credentials
  );
end;
$$;


ALTER FUNCTION "public"."get_customer_order_state"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_order_credentials"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order record;
  v_requester uuid := auth.uid();
begin
  if v_requester is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select id, customer_id, assigned_booster_id, status, payment_status,
         service_type, boost_mode, game_credentials, credentials_set,
         credential_expires_at
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  if v_requester is distinct from v_order.customer_id
     and v_requester is distinct from v_order.assigned_booster_id then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if v_order.payment_status is distinct from 'paid'::public.payment_status
     or v_order.status not in ('awaiting_assignment', 'assigned', 'in_progress', 'paused', 'awaiting_customer') then
    return jsonb_build_object('success', false, 'error', 'order_not_paid_or_active');
  end if;

  if not public.order_requires_access_token(v_order.service_type, v_order.boost_mode) then
    return jsonb_build_object('success', false, 'error', 'credentials_not_required_for_service');
  end if;

  if not v_order.credentials_set or v_order.game_credentials is null then
    return jsonb_build_object('success', false, 'error', 'no_credentials');
  end if;

  if v_order.credential_expires_at is null or v_order.credential_expires_at <= now() then
    return jsonb_build_object('success', false, 'error', 'token_expired');
  end if;

  return jsonb_build_object(
    'success', true,
    'access_token', encode(v_order.game_credentials::bytea, 'base64'),
    'expires_at', v_order.credential_expires_at
  );
end;
$$;


ALTER FUNCTION "public"."get_order_credentials"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_role       public.user_role;
  v_email      text;
  v_username   text;
  v_discord_id text;
begin
  v_role := case
    when new.raw_user_meta_data->>'role' = 'booster' then 'booster'::public.user_role
    else 'customer'::public.user_role
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


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_approved_booster"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select exists (
    select 1 from public.booster_profiles
    where user_id = auth.uid() and status = 'approved'
  )
$$;


ALTER FUNCTION "public"."is_approved_booster"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_match_result"("p_order_id" "uuid", "p_wins" integer, "p_losses" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order record;
begin
  select id, status, assigned_booster_id into v_order
  from   public.orders where id = p_order_id for update;

  if not found then return jsonb_build_object('success', false, 'error', 'order_not_found'); end if;
  if p_wins < 0 or p_losses < 0 then return jsonb_build_object('success', false, 'error', 'invalid_values'); end if;
  if auth.uid() is distinct from v_order.assigned_booster_id then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  if v_order.status not in ('in_progress', 'paused') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  update public.orders
  set    wins_played = p_wins, losses_played = p_losses, updated_at = now()
  where  id = p_order_id and p_wins >= wins_played and p_losses >= losses_played;

  if not found then return jsonb_build_object('success', false, 'error', 'cannot_decrease_counters'); end if;

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."log_match_result"("p_order_id" "uuid", "p_wins" integer, "p_losses" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboard_booster"("p_display_name" "text", "p_bio" "text", "p_peak_rank" "jsonb", "p_opgg_link" "text" DEFAULT NULL::"text", "p_hours_per_day_min" integer DEFAULT NULL::integer, "p_hours_per_day_max" integer DEFAULT NULL::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_role user_role;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if v_role is distinct from 'booster' then
    return jsonb_build_object('success', false, 'error', 'not_a_booster');
  end if;

  insert into public.booster_profiles(
    user_id, display_name, bio, status,
    peak_rank, opgg_link, hours_per_day_min, hours_per_day_max
  )
  values (
    auth.uid(), p_display_name, nullif(p_bio, ''), 'pending',
    p_peak_rank, nullif(p_opgg_link, ''), p_hours_per_day_min, p_hours_per_day_max
  )
  on conflict (user_id) do update set
    display_name        = excluded.display_name,
    bio                 = excluded.bio,
    peak_rank           = excluded.peak_rank,
    opgg_link           = excluded.opgg_link,
    hours_per_day_min   = excluded.hours_per_day_min,
    hours_per_day_max   = excluded.hours_per_day_max,
    updated_at          = now();

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."onboard_booster"("p_display_name" "text", "p_bio" "text", "p_peak_rank" "jsonb", "p_opgg_link" "text", "p_hours_per_day_min" integer, "p_hours_per_day_max" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboard_booster"("p_display_name" "text", "p_bio" "text", "p_peak_rank" "jsonb", "p_opgg_link" "text" DEFAULT NULL::"text", "p_hours_per_day_min" integer DEFAULT NULL::integer, "p_hours_per_day_max" integer DEFAULT NULL::integer, "p_full_name" "text" DEFAULT NULL::"text", "p_cpf" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_role  public.user_role;
  v_email text;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if v_role is null or v_role not in ('customer', 'booster') then
    return jsonb_build_object('success', false, 'error', 'invalid_role');
  end if;

  if nullif(trim(p_display_name), '') is null or length(trim(p_display_name)) > 80 then
    return jsonb_build_object('success', false, 'error', 'invalid_display_name');
  end if;

  if p_bio is not null and length(p_bio) > 256 then
    return jsonb_build_object('success', false, 'error', 'invalid_bio');
  end if;

  if p_hours_per_day_min is not null and (p_hours_per_day_min < 1 or p_hours_per_day_min > 24) then
    return jsonb_build_object('success', false, 'error', 'invalid_hours');
  end if;

  if p_hours_per_day_max is not null and (p_hours_per_day_max < 1 or p_hours_per_day_max > 24) then
    return jsonb_build_object('success', false, 'error', 'invalid_hours');
  end if;

  if p_hours_per_day_min is not null
     and p_hours_per_day_max is not null
     and p_hours_per_day_max < p_hours_per_day_min then
    return jsonb_build_object('success', false, 'error', 'invalid_hours');
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.booster_profiles(
    user_id, display_name, bio, status,
    peak_rank, opgg_link, hours_per_day_min, hours_per_day_max,
    full_name, email, cpf
  )
  values (
    auth.uid(), trim(p_display_name), nullif(trim(coalesce(p_bio, '')), ''), 'pending',
    p_peak_rank, nullif(trim(coalesce(p_opgg_link, '')), ''), p_hours_per_day_min, p_hours_per_day_max,
    nullif(trim(coalesce(p_full_name, '')), ''), v_email, nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '')
  )
  on conflict (user_id) do update set
    display_name      = excluded.display_name,
    bio               = excluded.bio,
    peak_rank         = excluded.peak_rank,
    opgg_link         = excluded.opgg_link,
    hours_per_day_min = excluded.hours_per_day_min,
    hours_per_day_max = excluded.hours_per_day_max,
    full_name         = excluded.full_name,
    email             = excluded.email,
    cpf               = excluded.cpf,
    updated_at        = now();

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."onboard_booster"("p_display_name" "text", "p_bio" "text", "p_peak_rank" "jsonb", "p_opgg_link" "text", "p_hours_per_day_min" integer, "p_hours_per_day_max" integer, "p_full_name" "text", "p_cpf" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."order_requires_access_token"("p_service_type" "public"."service_type", "p_boost_mode" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select
    (p_service_type = 'elo_boost' and coalesce(p_boost_mode, 'solo') = 'solo')
    or p_service_type in ('win_boost', 'md5')
$$;


ALTER FUNCTION "public"."order_requires_access_token"("p_service_type" "public"."service_type", "p_boost_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_non_admin_booster_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if not public.is_admin() and new.status is distinct from old.status then
    raise exception 'only admins can change booster application status';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_non_admin_booster_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_mp_payment_event"("p_order_id" "uuid", "p_mp_payment_id" "text", "p_provider_status" "text", "p_amount" numeric, "p_currency" "text", "p_event_id" "text", "p_refund_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_payment_status public.payment_status;
  v_to_status public.order_status;
begin
  if p_provider_status not in ('approved','pending','in_process','authorized','rejected','cancelled','refunded','charged_back') then
    return jsonb_build_object('success', true, 'ignored', true);
  end if;

  select * into v_order from public.orders
  where id = p_order_id and mp_payment_id = p_mp_payment_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'payment_order_mismatch'); end if;

  select * into v_payment from public.payments
  where order_id = p_order_id and mp_payment_id = p_mp_payment_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'payment_not_found'); end if;

  if lower(p_currency) <> 'brl' or round(p_amount, 2) <> round(v_order.total_price, 2) then
    return jsonb_build_object('success', false, 'error', 'payment_reconciliation_failed');
  end if;

  v_payment_status := case
    when p_provider_status = 'approved' then 'paid'::public.payment_status
    when p_provider_status in ('rejected','cancelled') then 'failed'::public.payment_status
    when p_provider_status = 'refunded' then 'refunded'::public.payment_status
    when p_provider_status = 'charged_back' then 'disputed'::public.payment_status
    else 'pending'::public.payment_status
  end;

  update public.payments set
    status = v_payment_status,
    webhook_event_id = p_event_id,
    refunded_amount = case when p_provider_status = 'refunded' then amount else refunded_amount end,
    updated_at = now()
  where id = v_payment.id;

  if p_provider_status = 'approved' and v_order.status = 'awaiting_payment' then
    update public.orders set status = 'awaiting_assignment', payment_status = 'paid', updated_at = now()
    where id = p_order_id;
    insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
    values (p_order_id, 'awaiting_payment', 'awaiting_assignment', v_order.customer_id,
            'Pagamento PIX confirmado via Mercado Pago');
    insert into public.notifications(user_id, type, title, body, data)
    values (v_order.customer_id, 'payment_confirmed', 'PIX confirmado!',
            'Seu pedido foi pago e está na fila de boosters.', jsonb_build_object('order_id', p_order_id));
  elsif p_provider_status in ('refunded','charged_back')
        and v_order.status not in ('refunded','disputed') then
    v_to_status := case when p_provider_status = 'refunded' then 'refunded'::public.order_status else 'disputed'::public.order_status end;
    update public.orders set status = v_to_status, payment_status = v_payment_status, updated_at = now()
    where id = p_order_id;
    insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
    values (p_order_id, v_order.status, v_to_status, v_order.customer_id,
            case when p_provider_status = 'refunded' then 'Pagamento reembolsado via Mercado Pago' else 'Chargeback recebido via Mercado Pago' end);
    insert into public.notifications(user_id, type, title, body, data)
    values (v_order.customer_id, 'order_status_changed',
            case when p_provider_status = 'refunded' then 'Pedido reembolsado' else 'Pagamento contestado' end,
            case when p_provider_status = 'refunded' then 'Seu pedido foi reembolsado.' else 'Seu pagamento está em disputa.' end,
            jsonb_build_object('order_id', p_order_id));
    if p_provider_status = 'refunded' then
      insert into public.refunds(payment_id, order_id, mp_refund_id, amount, reason, initiated_by, status)
      values (v_payment.id, p_order_id, coalesce(p_refund_id, p_mp_payment_id || '-refund'),
              v_order.total_price, 'Reembolso processado pelo Mercado Pago', v_order.customer_id, 'completed')
      on conflict (mp_refund_id) do nothing;
    end if;
  end if;

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."process_mp_payment_event"("p_order_id" "uuid", "p_mp_payment_id" "text", "p_provider_status" "text", "p_amount" numeric, "p_currency" "text", "p_event_id" "text", "p_refund_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rank_step"("p_tier" "text", "p_division" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select case
    when p_tier = 'master' then 28
    when p_tier = 'grandmaster' then 29
    when p_tier = 'challenger' then 30
    else
      (array_position(array['iron','bronze','silver','gold','platinum','emerald','diamond'], p_tier) - 1) * 4
      + coalesce(array_position(array['IV','III','II','I'], p_division), 1) - 1
  end
$$;


ALTER FUNCTION "public"."rank_step"("p_tier" "text", "p_division" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_pix_payment"("p_order_id" "uuid", "p_customer_id" "uuid", "p_mp_payment_id" "text", "p_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order public.orders%rowtype;
  v_existing text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.customer_id <> p_customer_id then raise exception 'order mismatch'; end if;
  if round(v_order.total_price, 2) <> round(p_amount, 2) or p_amount <= 0 then raise exception 'amount mismatch'; end if;
  if v_order.mp_payment_id is not null and v_order.mp_payment_id <> p_mp_payment_id then raise exception 'payment mismatch'; end if;

  select mp_payment_id into v_existing from public.payments where order_id = p_order_id for update;
  if found and v_existing <> p_mp_payment_id then raise exception 'payment mismatch'; end if;

  update public.orders set mp_payment_id = p_mp_payment_id, updated_at = now() where id = p_order_id;
  insert into public.payments(order_id, customer_id, mp_payment_id, amount, currency, status, metadata)
  values (p_order_id, p_customer_id, p_mp_payment_id, round(p_amount, 2), 'brl', 'pending',
          jsonb_build_object('provider', 'mercadopago', 'mp_payment_id', p_mp_payment_id))
  on conflict (order_id) do update set updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."record_pix_payment"("p_order_id" "uuid", "p_customer_id" "uuid", "p_mp_payment_id" "text", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_booster_rating"("p_booster_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_avg   numeric(3,2);
  v_count integer;
begin
  select round(avg(rating)::numeric, 2), count(*)
  into   v_avg, v_count
  from   public.reviews
  where  booster_id = p_booster_id
    and  is_public = true;

  update public.booster_profiles
  set    rating       = coalesce(v_avg, 0),
         rating_count = coalesce(v_count, 0)
  where  user_id = p_booster_id;
end;
$$;


ALTER FUNCTION "public"."refresh_booster_rating"("p_booster_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_top5_boosters"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_top5_ids uuid[];
begin
  if auth.uid() is not null and not public.is_admin() then
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

  update public.booster_profiles set is_top5 = false where is_top5 = true;

  if v_top5_ids is not null and array_length(v_top5_ids, 1) > 0 then
    update public.booster_profiles set is_top5 = true where user_id = any(v_top5_ids);
  end if;
end;
$$;


ALTER FUNCTION "public"."refresh_top5_boosters"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_booster_role"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_role public.user_role;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if v_role is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if v_role is null or v_role not in ('customer', 'booster') then
    return jsonb_build_object('success', false, 'error', 'invalid_role');
  end if;

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."request_booster_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_order_drop"("p_order_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order record;
  v_penalty_pct integer;
  v_penalty_amt numeric(10,2);
  v_reason text := trim(p_reason);
begin
  if v_reason is null or length(v_reason) < 10 or length(v_reason) > 500 then
    return jsonb_build_object('success', false, 'error', 'invalid_reason');
  end if;

  select id, status, assigned_booster_id, wins_played, losses_played, total_price
  into v_order
  from public.orders
  where id = p_order_id
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

  if exists (
    select 1
    from public.order_drop_requests
    where order_id = p_order_id and status = 'pending'
  ) then
    return jsonb_build_object('success', false, 'error', 'drop_request_already_pending');
  end if;

  v_penalty_pct := case
    when v_order.wins_played = 0 then 0
    when v_order.wins_played between 1 and 2 then 10
    else 20
  end;
  v_penalty_amt := round(v_order.total_price * v_penalty_pct / 100.0, 2);

  insert into public.order_drop_requests(
    order_id, booster_id, reason, wins_at_request, losses_at_request,
    penalty_pct, penalty_amount
  ) values (
    p_order_id, auth.uid(), v_reason, v_order.wins_played,
    v_order.losses_played, v_penalty_pct, v_penalty_amt
  );

  update public.orders
  set status = 'drop_requested', updated_at = now()
  where id = p_order_id;

  insert into public.order_status_history(
    order_id, from_status, to_status, changed_by, reason
  ) values (
    p_order_id, 'in_progress', 'drop_requested', auth.uid(), v_reason
  );

  return jsonb_build_object(
    'success', true,
    'penalty_pct', v_penalty_pct,
    'penalty_amount', v_penalty_amt
  );
end;
$$;


ALTER FUNCTION "public"."request_order_drop"("p_order_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_drop_request"("p_request_id" "uuid", "p_approve" boolean, "p_admin_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_req   record;
  v_actor record;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select r.id, r.order_id, r.booster_id, r.penalty_amount, r.status
  into   v_req from public.order_drop_requests r where r.id = p_request_id for update;

  if not found then return jsonb_build_object('success', false, 'error', 'request_not_found'); end if;
  if v_req.status <> 'pending' then return jsonb_build_object('success', false, 'error', 'already_resolved'); end if;

  select id, role into v_actor from public.profiles where id = auth.uid();

  if p_approve then
    update public.orders set status = 'canceled', updated_at = now() where id = v_req.order_id;
    insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
    values (v_req.order_id, 'drop_requested', 'canceled', auth.uid(), 'Drop request approved');
    if v_req.penalty_amount > 0 then
      update public.booster_profiles
      set    total_earnings = greatest(0, total_earnings - v_req.penalty_amount)
      where  user_id = v_req.booster_id;
    end if;
    insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, diff)
    values (v_actor.id, v_actor.role, 'drop_request.approved', 'order_drop_request', p_request_id::text,
            jsonb_build_object('order_id', v_req.order_id, 'penalty_amount', v_req.penalty_amount));
  else
    update public.orders set status = 'in_progress', updated_at = now() where id = v_req.order_id;
    insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
    values (v_req.order_id, 'drop_requested', 'in_progress', auth.uid(), 'Drop request rejected');
    insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, diff)
    values (v_actor.id, v_actor.role, 'drop_request.rejected', 'order_drop_request', p_request_id::text,
            jsonb_build_object('order_id', v_req.order_id));
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


ALTER FUNCTION "public"."resolve_drop_request"("p_request_id" "uuid", "p_approve" boolean, "p_admin_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_order_access_token"("p_access_token" "text", "p_booster_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_key text;
  v_cipher bytea;
  v_payload jsonb;
  v_order_id uuid;
  v_order record;
begin
  if p_booster_user_id is null
     or nullif(btrim(p_access_token), '') is null
     or char_length(p_access_token) > 8192 then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end if;

  begin
    v_cipher := decode(p_access_token, 'base64');
  exception when others then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end;

  select decrypted_secret
  into v_key
  from vault.decrypted_secrets
  where name = 'credential_key'
  limit 1;

  if v_key is null or char_length(v_key) < 32 then
    return jsonb_build_object('success', false, 'error', 'server_key_not_configured');
  end if;

  begin
    v_payload := pgp_sym_decrypt(v_cipher, v_key)::jsonb;
    if v_payload->>'v' <> '2'
       or v_payload->>'kind' <> 'riot_account_access'
       or nullif(v_payload->>'login', '') is null
       or nullif(v_payload->>'password', '') is null then
      return jsonb_build_object('success', false, 'error', 'invalid_token');
    end if;
    v_order_id := (v_payload->>'order_id')::uuid;
  exception when others then
    return jsonb_build_object('success', false, 'error', 'invalid_token');
  end;

  select id, customer_id, assigned_booster_id, status, payment_status,
         service_type, boost_mode, game_credentials, credentials_set,
         credential_expires_at
  into v_order
  from public.orders
  where id = v_order_id
    and assigned_booster_id = p_booster_user_id
    and credentials_set = true
    and game_credentials::bytea = v_cipher
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'token_not_found');
  end if;

  if not exists (
    select 1
    from public.booster_profiles bp
    where bp.user_id = p_booster_user_id
      and bp.status = 'approved'
  ) then
    return jsonb_build_object('success', false, 'error', 'booster_not_authorized');
  end if;

  if v_order.payment_status is distinct from 'paid'::public.payment_status
     or v_order.status not in ('assigned', 'in_progress', 'paused', 'awaiting_customer') then
    return jsonb_build_object('success', false, 'error', 'order_not_active');
  end if;

  if not public.order_requires_access_token(v_order.service_type, v_order.boost_mode) then
    return jsonb_build_object('success', false, 'error', 'credentials_not_required_for_service');
  end if;

  if v_order.credential_expires_at is null
     or v_order.credential_expires_at <= now()
     or (v_payload->>'expires_at')::timestamptz <= now()
     or (v_payload->>'customer_id')::uuid is distinct from v_order.customer_id then
    return jsonb_build_object('success', false, 'error', 'token_expired_or_invalid');
  end if;

  return jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'login', v_payload->>'login',
    'password', v_payload->>'password'
  );
exception when others then
  return jsonb_build_object('success', false, 'error', 'invalid_token');
end;
$$;


ALTER FUNCTION "public"."resolve_order_access_token"("p_access_token" "text", "p_booster_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_order_message"("p_order_id" "uuid", "p_content" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_role public.user_role;
  v_order public.orders%rowtype;
  v_content text := btrim(coalesce(p_content, ''));
  v_message_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated', 'message', 'Sessao nao autenticada.');
  end if;

  v_role := public.current_user_role();
  if v_role is null then
    return jsonb_build_object('success', false, 'code', 'profile_not_found', 'message', 'Perfil de usuario nao encontrado.');
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  if not found or not (
    v_role = 'admin'::public.user_role
    or v_order.customer_id = v_user_id
    or v_order.assigned_booster_id = v_user_id
  ) then
    return jsonb_build_object('success', false, 'code', 'order_not_found', 'message', 'Pedido nao encontrado.');
  end if;

  if v_order.assigned_booster_id is null then
    return jsonb_build_object('success', false, 'code', 'chat_unavailable', 'message', 'O chat sera liberado quando um booster for atribuido.');
  end if;

  if v_order.chat_locked and v_role <> 'admin'::public.user_role then
    return jsonb_build_object('success', false, 'code', 'chat_locked', 'message', 'O chat foi bloqueado pela administracao.');
  end if;

  if char_length(v_content) < 1 or char_length(v_content) > 4000 then
    return jsonb_build_object('success', false, 'code', 'invalid_content', 'message', 'A mensagem deve ter entre 1 e 4000 caracteres.');
  end if;

  if not public.check_own_write_rate_limit('order_chat:' || p_order_id::text, 20, 60) then
    return jsonb_build_object('success', false, 'code', 'rate_limited', 'message', 'Muitas mensagens em pouco tempo. Aguarde um minuto.');
  end if;

  insert into public.order_messages(order_id, sender_id, sender_role, content, is_read)
  values (p_order_id, v_user_id, v_role, v_content, false)
  returning id into v_message_id;

  return jsonb_build_object('success', true, 'message_id', v_message_id);
end;
$$;


ALTER FUNCTION "public"."send_order_message"("p_order_id" "uuid", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_duo_account_credentials"("p_account_id" "uuid", "p_login" "text", "p_password" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_key text;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if not exists (select 1 from public.duo_accounts where id = p_account_id) then
    return jsonb_build_object('success', false, 'error', 'account_not_found');
  end if;

  select decrypted_secret into v_key
  from   vault.decrypted_secrets
  where  name = 'credential_key'
  limit  1;

  if v_key is null or length(v_key) < 32 then
    return jsonb_build_object('success', false, 'error', 'server_key_not_configured');
  end if;

  update public.duo_accounts
  set
    encrypted_credentials = pgp_sym_encrypt(p_login || '|' || p_password, v_key),
    updated_at            = now()
  where id = p_account_id;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id)
  values (auth.uid(), public.current_user_role(), 'duo_account.credentials_set', 'duo_account', p_account_id::text);

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."set_duo_account_credentials"("p_account_id" "uuid", "p_login" "text", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_master_plus_pricing_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_master_plus_pricing_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_order_credentials"("p_order_id" "uuid", "p_login" "text", "p_password" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order record;
  v_key text;
  v_payload text;
  v_cipher bytea;
  v_expires_at timestamptz := now() + interval '30 days';
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select id, customer_id, status, payment_status, service_type, boost_mode
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  if auth.uid() is distinct from v_order.customer_id then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if v_order.payment_status is distinct from 'paid'::public.payment_status
     or v_order.status not in ('awaiting_assignment', 'assigned', 'in_progress', 'paused', 'awaiting_customer') then
    return jsonb_build_object('success', false, 'error', 'order_not_paid_or_active');
  end if;

  if not public.order_requires_access_token(v_order.service_type, v_order.boost_mode) then
    return jsonb_build_object('success', false, 'error', 'credentials_not_required_for_service');
  end if;

  if nullif(btrim(p_login), '') is null or char_length(btrim(p_login)) > 160 then
    return jsonb_build_object('success', false, 'error', 'invalid_login');
  end if;

  if p_password is null or char_length(p_password) < 4 or char_length(p_password) > 256 then
    return jsonb_build_object('success', false, 'error', 'invalid_password');
  end if;

  select decrypted_secret
  into v_key
  from vault.decrypted_secrets
  where name = 'credential_key'
  limit 1;

  if v_key is null or char_length(v_key) < 32 then
    return jsonb_build_object('success', false, 'error', 'server_key_not_configured');
  end if;

  v_payload := jsonb_build_object(
    'v', 2,
    'kind', 'riot_account_access',
    'order_id', v_order.id,
    'customer_id', v_order.customer_id,
    'login', btrim(p_login),
    'password', p_password,
    'issued_at', now(),
    'expires_at', v_expires_at
  )::text;

  v_cipher := pgp_sym_encrypt(
    v_payload,
    v_key,
    'compress-algo=1, cipher-algo=aes256'
  );

  update public.orders
  set game_credentials = v_cipher::text,
      credentials_set = true,
      credential_expires_at = v_expires_at,
      updated_at = now()
  where id = v_order.id;

  return jsonb_build_object(
    'success', true,
    'access_token', encode(v_cipher, 'base64'),
    'expires_at', v_expires_at
  );
end;
$$;


ALTER FUNCTION "public"."set_order_credentials"("p_order_id" "uuid", "p_login" "text", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_booster_top5"("p_booster_id" "uuid", "p_is_top5" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
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

  if not found then return jsonb_build_object('success', false, 'error', 'booster_not_found'); end if;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id)
  values (v_actor.id, v_actor.role,
          case when p_is_top5 then 'booster.top5_granted' else 'booster.top5_removed' end,
          'booster_profile', p_booster_id::text);

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."toggle_booster_top5"("p_booster_id" "uuid", "p_is_top5" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_booster_active_on_accept"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if NEW.assigned_booster_id is not null
     and (OLD.assigned_booster_id is null or OLD.assigned_booster_id <> NEW.assigned_booster_id)
  then
    update public.booster_profiles
      set last_active_at = now()
      where user_id = NEW.assigned_booster_id;
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."trg_fn_booster_active_on_accept"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_booster_active_on_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if NEW.sender_role = 'booster' then
    update public.booster_profiles
      set last_active_at = now()
      where user_id = NEW.sender_id;
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."trg_fn_booster_active_on_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_cap_coach_packages"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.booster_services
  where booster_id = new.booster_id;
  if v_count >= 3 then
    raise exception 'booster_service_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_fn_cap_coach_packages"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_fn_cap_coach_packages"() IS 'Caps booster_services at 3 rows per booster, TOTAL across every service_type (coaching/boost_package/other) — not scoped to coaching alone since migration 022 generalized the table. Name kept for compatibility with migration 012''s trigger binding; behavior is no longer coaching-specific.';



CREATE OR REPLACE FUNCTION "public"."trg_fn_enforce_booster_display_name_cooldown"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_days_remaining integer;
begin
  if new.display_name is distinct from old.display_name then
    if public.is_admin() then
      new.display_name_changed_at := now();
    elsif old.display_name_changed_at is not null
      and old.display_name_changed_at > now() - interval '30 days' then
      v_days_remaining := ceil(extract(epoch from ((old.display_name_changed_at + interval '30 days') - now())) / 86400);
      raise exception 'Nome de exibição só pode ser alterado a cada 30 dias. Tente novamente em % dia(s).', v_days_remaining
        using errcode = 'P0001';
    else
      new.display_name_changed_at := now();
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_fn_enforce_booster_display_name_cooldown"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_enforce_message_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if not public.check_own_write_rate_limit('chat_message', 20, 60) then
    raise exception 'rate_limit_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_fn_enforce_message_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_enforce_review_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if not public.check_own_write_rate_limit('review_submit', 5, 60) then
    raise exception 'rate_limit_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_fn_enforce_review_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_guard_booster_profile_trust_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    new.status          := old.status;
    new.total_completed := old.total_completed;
    new.total_earnings  := old.total_earnings;
    new.rating          := old.rating;
    new.rating_count    := old.rating_count;
    new.is_top5         := old.is_top5;
    new.verified_at     := old.verified_at;
    new.current_rank    := old.current_rank;
    new.rank_stats      := old.rank_stats;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_fn_guard_booster_profile_trust_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_guard_customer_profile_trust_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    new.total_orders := old.total_orders;
    new.total_spent  := old.total_spent;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_fn_guard_customer_profile_trust_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_guard_notifications_user_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    new.user_id    := old.user_id;
    new.type       := old.type;
    new.title      := old.title;
    new.body       := old.body;
    new.data       := old.data;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_fn_guard_notifications_user_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_guard_profiles_trust_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    new.username    := old.username;    -- só via RPC update_my_username (checa unicidade)
    new.email       := old.email;       -- vem do Discord OAuth
    new.discord_id  := old.discord_id;  -- vem do Discord OAuth
    new.role        := old.role;        -- reforço; já travado via WITH CHECK em profiles_update_own
    new.created_at  := old.created_at;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_fn_guard_profiles_trust_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_order_completed_booster_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_commission_rate   constant numeric(5,4) := 0.25;
  v_commission_amount numeric(10,2);
  v_net_amount        numeric(10,2);
begin
  if NEW.status = 'completed'
     and OLD.status is distinct from 'completed'
     and NEW.assigned_booster_id is not null
  then
    v_commission_amount := round(NEW.total_price * v_commission_rate, 2);
    v_net_amount := NEW.total_price - v_commission_amount;

    update public.booster_profiles
      set total_completed = total_completed + 1,
          total_earnings  = total_earnings + v_net_amount
      where user_id = NEW.assigned_booster_id;

    insert into public.payout_records(
      booster_id, order_id, gross_amount, commission_rate, commission_amount, net_amount, status
    ) values (
      NEW.assigned_booster_id, NEW.id, NEW.total_price, v_commission_rate, v_commission_amount, v_net_amount, 'pending'
    );
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."trg_fn_order_completed_booster_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_order_paid_customer_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if NEW.status = 'awaiting_assignment' and OLD.status = 'awaiting_payment' then
    update public.customer_profiles
      set total_orders = total_orders + 1,
          total_spent  = total_spent + NEW.total_price
      where user_id = NEW.customer_id;
  end if;

  -- Reverses the increment above when a previously-counted order (i.e. one
  -- that had already moved past draft/awaiting_payment, so it was actually
  -- added to the totals at some point) ends up canceled or refunded.
  -- OLD.status not in (..., 'canceled', 'refunded') also guards against
  -- ever reversing the same order's contribution twice.
  if NEW.status in ('canceled', 'refunded')
     and OLD.status not in ('draft', 'awaiting_payment', 'canceled', 'refunded') then
    update public.customer_profiles
      set total_orders = greatest(0, total_orders - 1),
          total_spent  = greatest(0, total_spent - NEW.total_price)
      where user_id = NEW.customer_id;
  end if;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."trg_fn_order_paid_customer_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_reviews_refresh_booster_rating"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if TG_OP = 'DELETE' then
    if old.booster_id is not null then
      perform public.refresh_booster_rating(old.booster_id);
    end if;
    return old;
  end if;

  if new.booster_id is not null then
    perform public.refresh_booster_rating(new.booster_id);
  end if;
  if TG_OP = 'UPDATE' and old.booster_id is not null and old.booster_id is distinct from new.booster_id then
    perform public.refresh_booster_rating(old.booster_id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_fn_reviews_refresh_booster_rating"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_order_completed_refresh_top5"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    perform public.refresh_top5_boosters();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_order_completed_refresh_top5"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_booster_applications_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_booster_applications_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_booster_services_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_booster_services_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_duo_accounts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_duo_accounts_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_username"("p_username" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $_$
declare
  v_username text := btrim(p_username);
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'error', 'unauthorized'); end if;
  if char_length(v_username) < 3 or char_length(v_username) > 30
     or v_username !~ '^[A-Za-z0-9_]+$' then
    return jsonb_build_object('success', false, 'error', 'invalid_username');
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(v_username) and id <> auth.uid()) then
    return jsonb_build_object('success', false, 'error', 'username_taken');
  end if;
  update public.profiles set username = v_username, updated_at = now() where id = auth.uid();
  return jsonb_build_object('success', true);
end;
$_$;


ALTER FUNCTION "public"."update_my_username"("p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_order record;
  v_to_status public.order_status;
  v_allowed boolean := false;
begin
  v_to_status := p_new_status::public.order_status;

  select id, status, assigned_booster_id into v_order
  from   public.orders where id = p_order_id for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  if public.is_admin() then
    update public.orders set status = v_to_status, updated_at = now()
    where id = p_order_id;

    insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
    values (p_order_id, v_order.status, v_to_status, auth.uid(), coalesce(p_reason, 'Admin status update'));

    return jsonb_build_object('success', true);
  end if;

  if auth.uid() is distinct from v_order.assigned_booster_id then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  v_allowed := case
    when v_order.status = 'assigned'          and v_to_status = 'in_progress' then true
    when v_order.status = 'in_progress'       and v_to_status in ('paused', 'awaiting_customer') then true
    when v_order.status = 'paused'            and v_to_status in ('in_progress', 'awaiting_customer') then true
    when v_order.status = 'awaiting_customer' and v_to_status in ('in_progress', 'paused') then true
    else false
  end;

  if not v_allowed then
    return jsonb_build_object('success', false, 'error', 'invalid_transition');
  end if;

  update public.orders set status = v_to_status, updated_at = now()
  where id = p_order_id;

  insert into public.order_status_history(order_id, from_status, to_status, changed_by, reason)
  values (p_order_id, v_order.status, v_to_status, auth.uid(), p_reason);

  return jsonb_build_object('success', true);
end;
$$;


ALTER FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "text", "p_reason" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."duo_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "text" DEFAULT 'lol'::"text" NOT NULL,
    "label" "text" NOT NULL,
    "current_rank" "jsonb",
    "notes" "text",
    "encrypted_credentials" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."duo_accounts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."admin_duo_accounts" WITH ("security_barrier"='true', "security_invoker"='true') AS
 SELECT "id",
    "game_id",
    "label",
    "current_rank",
    "notes",
    "is_active",
    "created_by",
    "created_at",
    "updated_at"
   FROM "public"."duo_accounts"
  WHERE "public"."is_admin"();


ALTER VIEW "public"."admin_duo_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "actor_role" "public"."user_role" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text" NOT NULL,
    "diff" "jsonb",
    "ip_address" "inet",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "service_id" "text" NOT NULL,
    "game_id" "text" NOT NULL,
    "status" "public"."order_status" DEFAULT 'draft'::"public"."order_status" NOT NULL,
    "queue_type" "public"."queue_type" DEFAULT 'solo_duo'::"public"."queue_type" NOT NULL,
    "boost_mode" "text" DEFAULT 'solo'::"text" NOT NULL,
    "server" "text" NOT NULL,
    "current_rank" "jsonb" NOT NULL,
    "target_rank" "jsonb",
    "wins_purchased" integer,
    "sessions_purchased" integer,
    "win_package" smallint,
    "extras" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "base_price" numeric(10,2) NOT NULL,
    "extras_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_price" numeric(10,2) NOT NULL,
    "estimated_hours" integer,
    "customer_notes" "text",
    "booster_notes" "text",
    "wins_played" integer DEFAULT 0 NOT NULL,
    "losses_played" integer DEFAULT 0 NOT NULL,
    "assigned_booster_id" "uuid",
    "mp_payment_id" "text",
    "payment_status" "public"."payment_status",
    "game_credentials" "text",
    "credentials_set" boolean DEFAULT false NOT NULL,
    "discord_voice_channel_id" "text",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_pdl" integer,
    "pdl_bracket" "text",
    "avg_pdl_gain" numeric(6,2),
    "avg_pdl_loss" numeric(6,2),
    "pricing_version" "text" DEFAULT 'v1'::"text" NOT NULL,
    "idempotency_key" "uuid",
    "used_exclusive_slot" boolean DEFAULT false NOT NULL,
    "riot_id" "text",
    "booster_service_id" "uuid",
    "preferred_booster_id" "uuid",
    "exclusive_until" timestamp with time zone,
    "service_type" "public"."service_type" NOT NULL,
    "md5_matches_remaining" smallint,
    "chat_locked" boolean DEFAULT false NOT NULL,
    "chat_locked_by" "uuid",
    "chat_locked_at" timestamp with time zone,
    "credential_expires_at" timestamp with time zone,
    CONSTRAINT "orders_avg_pdl_gain_check" CHECK ((("avg_pdl_gain" IS NULL) OR ("avg_pdl_gain" > (0)::numeric))),
    CONSTRAINT "orders_avg_pdl_loss_check" CHECK ((("avg_pdl_loss" IS NULL) OR ("avg_pdl_loss" > (0)::numeric))),
    CONSTRAINT "orders_boost_mode_check" CHECK (("boost_mode" = ANY (ARRAY['solo'::"text", 'duo'::"text"]))),
    CONSTRAINT "orders_credentials_consistency_check" CHECK (((("credentials_set" = true) AND ("game_credentials" IS NOT NULL) AND ("credential_expires_at" IS NOT NULL)) OR (("credentials_set" = false) AND ("game_credentials" IS NULL) AND ("credential_expires_at" IS NULL)))),
    CONSTRAINT "orders_current_pdl_check" CHECK ((("current_pdl" IS NULL) OR ("current_pdl" >= 0))),
    CONSTRAINT "orders_match_counters_nonnegative" CHECK ((("wins_played" >= 0) AND ("losses_played" >= 0))),
    CONSTRAINT "orders_md5_matches_remaining_check" CHECK ((("md5_matches_remaining" IS NULL) OR (("md5_matches_remaining" >= 0) AND ("md5_matches_remaining" <= 5)))),
    CONSTRAINT "orders_pdl_bracket_check" CHECK ((("pdl_bracket" IS NULL) OR ("pdl_bracket" = ANY (ARRAY['0_49'::"text", '50_89'::"text", '90_119'::"text", '120_plus'::"text"])))),
    CONSTRAINT "orders_price_sum" CHECK (("total_price" = "round"(("base_price" + "extras_price"), 2))),
    CONSTRAINT "orders_prices_nonnegative" CHECK ((("base_price" >= (0)::numeric) AND ("extras_price" >= (0)::numeric) AND ("total_price" >= (0)::numeric))),
    CONSTRAINT "orders_win_package_check" CHECK (("win_package" = ANY (ARRAY[1, 3, 5])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."available_boost_orders" WITH ("security_barrier"='true') AS
 SELECT "id",
    "service_id",
    "game_id",
    "status",
    "queue_type",
    "boost_mode",
    "server",
    "current_rank",
    "target_rank",
    "wins_purchased",
    "sessions_purchased",
    "win_package",
    "extras",
    "total_price",
    "estimated_hours",
    "wins_played",
    "losses_played",
    "current_pdl",
    "pdl_bracket",
    "avg_pdl_gain",
    "avg_pdl_loss",
    "pricing_version",
    "created_at",
    "updated_at",
    "preferred_booster_id",
    "exclusive_until"
   FROM "public"."orders"
  WHERE (("status" = 'awaiting_assignment'::"public"."order_status") AND ("assigned_booster_id" IS NULL) AND "public"."is_approved_booster"() AND ((NOT "public"."order_requires_access_token"("service_type", "boost_mode")) OR ("credentials_set" = true)) AND (("preferred_booster_id" IS NULL) OR ("exclusive_until" IS NULL) OR ("exclusive_until" <= "now"()) OR ("preferred_booster_id" = "auth"."uid"())));


ALTER VIEW "public"."available_boost_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booster_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "summoner_name" "text" NOT NULL,
    "opgg_link" "text",
    "region" "text" NOT NULL,
    "peak_rank" "text" NOT NULL,
    "roles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "games" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "has_coaching" boolean DEFAULT false NOT NULL,
    "available_days" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "hours_per_week" integer NOT NULL,
    "years_experience" numeric(4,1) NOT NULL,
    "discord_tag" "text",
    "motivation" "text" NOT NULL,
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "cpf" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin_notes" "text",
    CONSTRAINT "booster_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'under_review'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."booster_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booster_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "status" "public"."booster_status" DEFAULT 'pending'::"public"."booster_status" NOT NULL,
    "bio" "text",
    "peak_rank" "jsonb",
    "current_rank" "jsonb",
    "games" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "queue_preferences" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "region_preferences" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "lanes" "text"[],
    "specialties" "text"[],
    "available_days" "text"[],
    "total_completed" integer DEFAULT 0 NOT NULL,
    "total_earnings" numeric(10,2) DEFAULT 0 NOT NULL,
    "rating" numeric(3,2) DEFAULT 0 NOT NULL,
    "rating_count" integer DEFAULT 0 NOT NULL,
    "is_available" boolean DEFAULT false NOT NULL,
    "is_top5" boolean DEFAULT false NOT NULL,
    "rank_stats" "jsonb",
    "last_active_at" timestamp with time zone,
    "opgg_link" "text",
    "hours_per_day_min" smallint,
    "hours_per_day_max" smallint,
    "full_name" "text",
    "email" "text",
    "cpf" "text",
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_name_changed_at" timestamp with time zone
);


ALTER TABLE "public"."booster_profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."booster_profiles"."display_name_changed_at" IS 'Quando display_name foi alterado pela última vez -- controla o cooldown de 30 dias (trg_fn_enforce_booster_display_name_cooldown, migration 025). Null = nunca alterado desde que esta coluna existe; próxima troca é sempre permitida nesse caso.';



CREATE TABLE IF NOT EXISTS "public"."booster_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booster_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "tempo" "text",
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "service_type" "text",
    "unit" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "requirements" "text",
    "availability_note" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "rules" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lanes" "text"[],
    "specialties" "text"[],
    CONSTRAINT "booster_services_lanes_valid" CHECK ((("lanes" IS NULL) OR (("array_length"("lanes", 1) <= 2) AND ("lanes" <@ ARRAY['top'::"text", 'jungle'::"text", 'mid'::"text", 'bot'::"text", 'support'::"text"])))),
    CONSTRAINT "booster_services_price_nonnegative" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "booster_services_specialties_valid" CHECK ((("specialties" IS NULL) OR ("specialties" <@ ARRAY['macro'::"text", 'micro'::"text", 'wave_control'::"text", 'invades'::"text", 'vision'::"text", 'trades'::"text", 'teamfighting'::"text", 'laning_phase'::"text", 'objectives'::"text", 'itemization'::"text", 'matchups'::"text", 'mindset'::"text"])))
);


ALTER TABLE "public"."booster_services" OWNER TO "postgres";


COMMENT ON TABLE "public"."booster_services" IS 'Ofertas de serviço do booster (até 3 no total, entre qualquer tipo — ver trigger trg_fn_cap_coach_packages, migration 023) — apesar do nome legado, service_type não é mais exclusivamente ''coaching''; a UI (BoosterServicesList.tsx) permite qualquer tipo de serviço.';



CREATE TABLE IF NOT EXISTS "public"."customer_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text",
    "country" "text",
    "preferred_language" "text" DEFAULT 'en'::"text",
    "total_orders" integer DEFAULT 0 NOT NULL,
    "total_spent" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."edge_rate_limits" (
    "scope" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "window_started_at" timestamp with time zone NOT NULL,
    "request_count" integer NOT NULL,
    CONSTRAINT "edge_rate_limits_request_count_check" CHECK (("request_count" > 0))
);


ALTER TABLE "public"."edge_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "icon_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."master_plus_pricing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "price" numeric(10,2),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "tier" "text" NOT NULL,
    CONSTRAINT "master_plus_price_positive" CHECK ((("price" IS NULL) OR ("price" > (0)::numeric))),
    CONSTRAINT "master_plus_pricing_tier_check" CHECK (("tier" = ANY (ARRAY['master'::"text", 'grandmaster'::"text", 'challenger'::"text"])))
);


ALTER TABLE "public"."master_plus_pricing" OWNER TO "postgres";


COMMENT ON TABLE "public"."master_plus_pricing" IS 'Preço comercial fixo por tier alvo do Boost Master+ (Master, Grão-Mestre, Challenger) — um único preço por tier, independente de qual tier o cliente parte e da faixa de PDL atual. Ver shared/pricing.ts::MASTER_PLUS_TIER_PRICE_CENTS para os mesmos valores em código (referência/teste); o preço autoritativo do pedido sempre vem desta tabela.';



COMMENT ON COLUMN "public"."master_plus_pricing"."tier" IS 'Tier ao qual este preço se refere. O rank ATUAL do cliente no fluxo Master+ só pode ser Master ou Grão-Mestre — a linha "master" existe só para exibição na página pública de preços.';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_drop_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "booster_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "wins_at_request" integer DEFAULT 0 NOT NULL,
    "losses_at_request" integer DEFAULT 0 NOT NULL,
    "penalty_pct" integer DEFAULT 0 NOT NULL,
    "penalty_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin_id" "uuid",
    "admin_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "order_drop_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."order_drop_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "sender_role" "public"."user_role" NOT NULL,
    "content" "text" NOT NULL,
    "attachment_url" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "order_messages_content_length" CHECK ((("char_length"("btrim"("content")) >= 1) AND ("char_length"("btrim"("content")) <= 4000)))
);


ALTER TABLE "public"."order_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_rank_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "riot_id_checked" "text" NOT NULL,
    "fetched_tier" "text",
    "fetched_division" "text",
    "target_tier" "text" NOT NULL,
    "target_division" "text",
    "passed" boolean NOT NULL,
    "error_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_rank_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "from_status" "public"."order_status",
    "to_status" "public"."order_status" NOT NULL,
    "changed_by" "uuid" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "mp_payment_id" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'brl'::"text" NOT NULL,
    "status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status" NOT NULL,
    "payment_method_type" "text",
    "webhook_event_id" "text",
    "refunded_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_amount_positive" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "payments_refund_range" CHECK ((("refunded_amount" >= (0)::numeric) AND ("refunded_amount" <= "amount")))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payout_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booster_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "gross_amount" numeric(10,2) NOT NULL,
    "commission_rate" numeric(5,4) DEFAULT 0.25 NOT NULL,
    "commission_amount" numeric(10,2) NOT NULL,
    "net_amount" numeric(10,2) NOT NULL,
    "status" "public"."payout_status" DEFAULT 'pending'::"public"."payout_status" NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payout_amounts_nonnegative" CHECK ((("gross_amount" >= (0)::numeric) AND ("commission_amount" >= (0)::numeric) AND ("net_amount" >= (0)::numeric) AND (("commission_rate" >= (0)::numeric) AND ("commission_rate" <= (1)::numeric))))
);


ALTER TABLE "public"."payout_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'customer'::"public"."user_role" NOT NULL,
    "username" "text" NOT NULL,
    "avatar_url" "text",
    "discord_id" "text",
    "terms_accepted_at" timestamp with time zone,
    "privacy_accepted_at" timestamp with time zone,
    "legal_version" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_booster_profiles" WITH ("security_barrier"='true') AS
 SELECT "bp"."id",
    "bp"."user_id",
    "bp"."display_name",
    "bp"."bio",
    "bp"."current_rank",
    "bp"."peak_rank",
    "bp"."games",
    "bp"."rating",
    "bp"."rating_count",
    "bp"."total_completed",
    (("bp"."last_active_at" IS NOT NULL) AND ("bp"."last_active_at" > ("now"() - '00:05:00'::interval))) AS "is_available",
    "bp"."is_top5",
    "bp"."rank_stats",
    "bp"."last_active_at",
    "bp"."updated_at",
    "bp"."lanes",
    "bp"."specialties",
    "p"."avatar_url"
   FROM ("public"."booster_profiles" "bp"
     JOIN "public"."profiles" "p" ON (("p"."id" = "bp"."user_id")))
  WHERE ("bp"."status" = 'approved'::"public"."booster_status");


ALTER VIEW "public"."public_booster_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "mp_refund_id" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "reason" "text" NOT NULL,
    "initiated_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "refunds_amount_positive" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."refunds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "booster_id" "uuid",
    "rating" smallint NOT NULL,
    "content" "text",
    "is_public" boolean DEFAULT true NOT NULL,
    "is_moderated" boolean DEFAULT false NOT NULL,
    "admin_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_content_length" CHECK ((("content" IS NULL) OR ("char_length"("content") <= 2000))),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_extras" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "price_modifier" numeric(8,2) DEFAULT 0 NOT NULL,
    "price_modifier_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "icon" "text",
    "flow" "text",
    "code" "text",
    CONSTRAINT "service_extras_flow_check" CHECK ((("flow" IS NULL) OR ("flow" = ANY (ARRAY['solo_standard'::"text", 'duo_standard'::"text", 'master_plus'::"text"])))),
    CONSTRAINT "service_extras_modifiers_nonnegative" CHECK ((("price_modifier" >= (0)::numeric) AND (("price_modifier_pct" >= (0)::numeric) AND ("price_modifier_pct" <= (100)::numeric))))
);


ALTER TABLE "public"."service_extras" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "type" "public"."service_type" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "short_description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."services" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booster_applications"
    ADD CONSTRAINT "booster_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booster_profiles"
    ADD CONSTRAINT "booster_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booster_profiles"
    ADD CONSTRAINT "booster_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."booster_services"
    ADD CONSTRAINT "booster_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."duo_accounts"
    ADD CONSTRAINT "duo_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."edge_rate_limits"
    ADD CONSTRAINT "edge_rate_limits_pkey" PRIMARY KEY ("scope", "subject");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."master_plus_pricing"
    ADD CONSTRAINT "master_plus_pricing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_plus_pricing"
    ADD CONSTRAINT "master_plus_pricing_tier_key" UNIQUE ("tier");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_drop_requests"
    ADD CONSTRAINT "order_drop_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_messages"
    ADD CONSTRAINT "order_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_rank_verifications"
    ADD CONSTRAINT "order_rank_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_mp_payment_id_key" UNIQUE ("mp_payment_id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_mp_payment_id_key" UNIQUE ("mp_payment_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_webhook_event_id_key" UNIQUE ("webhook_event_id");



ALTER TABLE ONLY "public"."payout_records"
    ADD CONSTRAINT "payout_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_mp_refund_id_key" UNIQUE ("mp_refund_id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_extras"
    ADD CONSTRAINT "service_extras_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_game_id_type_key" UNIQUE ("game_id", "type");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



CREATE INDEX "audit_logs_actor_idx" ON "public"."audit_logs" USING "btree" ("actor_id");



CREATE INDEX "audit_logs_created_at_idx" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "audit_logs_entity_idx" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "booster_applications_created_at_idx" ON "public"."booster_applications" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "booster_applications_one_pending_idx" ON "public"."booster_applications" USING "btree" ("user_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "booster_applications_status_idx" ON "public"."booster_applications" USING "btree" ("status");



CREATE INDEX "booster_applications_user_id_idx" ON "public"."booster_applications" USING "btree" ("user_id");



CREATE INDEX "booster_profiles_available_idx" ON "public"."booster_profiles" USING "btree" ("is_available") WHERE ("is_available" = true);



CREATE INDEX "booster_profiles_status_idx" ON "public"."booster_profiles" USING "btree" ("status");



CREATE INDEX "booster_profiles_top5_idx" ON "public"."booster_profiles" USING "btree" ("is_top5") WHERE ("is_top5" = true);



CREATE INDEX "booster_services_active_idx" ON "public"."booster_services" USING "btree" ("is_active");



CREATE INDEX "booster_services_booster_idx" ON "public"."booster_services" USING "btree" ("booster_id");



CREATE INDEX "duo_accounts_active_idx" ON "public"."duo_accounts" USING "btree" ("is_active");



CREATE INDEX "duo_accounts_created_by_idx" ON "public"."duo_accounts" USING "btree" ("created_by");



CREATE INDEX "master_plus_pricing_updated_by_idx" ON "public"."master_plus_pricing" USING "btree" ("updated_by");



CREATE INDEX "notifications_unread_idx" ON "public"."notifications" USING "btree" ("user_id", "is_read") WHERE ("is_read" = false);



CREATE INDEX "notifications_user_idx" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "order_drop_requests_admin_id_idx" ON "public"."order_drop_requests" USING "btree" ("admin_id");



CREATE INDEX "order_drop_requests_booster_id_idx" ON "public"."order_drop_requests" USING "btree" ("booster_id");



CREATE UNIQUE INDEX "order_drop_requests_one_pending_idx" ON "public"."order_drop_requests" USING "btree" ("order_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "order_messages_order_idx" ON "public"."order_messages" USING "btree" ("order_id");



CREATE INDEX "order_messages_sender_idx" ON "public"."order_messages" USING "btree" ("sender_id");



CREATE INDEX "order_rank_verifications_order_idx" ON "public"."order_rank_verifications" USING "btree" ("order_id");



CREATE INDEX "order_rank_verifications_requested_by_idx" ON "public"."order_rank_verifications" USING "btree" ("requested_by");



CREATE INDEX "order_status_history_changed_by_idx" ON "public"."order_status_history" USING "btree" ("changed_by");



CREATE INDEX "order_status_history_order_idx" ON "public"."order_status_history" USING "btree" ("order_id");



CREATE INDEX "orders_booster_completed_at_idx" ON "public"."orders" USING "btree" ("assigned_booster_id", "completed_at") WHERE ("status" = 'completed'::"public"."order_status");



CREATE INDEX "orders_booster_id_idx" ON "public"."orders" USING "btree" ("assigned_booster_id");



CREATE INDEX "orders_booster_service_id_idx" ON "public"."orders" USING "btree" ("booster_service_id");



CREATE INDEX "orders_chat_locked_by_idx" ON "public"."orders" USING "btree" ("chat_locked_by");



CREATE INDEX "orders_created_at_idx" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "orders_customer_id_idx" ON "public"."orders" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "orders_customer_idempotency_idx" ON "public"."orders" USING "btree" ("customer_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "orders_preferred_booster_idx" ON "public"."orders" USING "btree" ("preferred_booster_id") WHERE ("preferred_booster_id" IS NOT NULL);



CREATE INDEX "orders_service_type_idx" ON "public"."orders" USING "btree" ("service_type");



CREATE INDEX "orders_status_idx" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "payments_customer_idx" ON "public"."payments" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "payments_order_unique_idx" ON "public"."payments" USING "btree" ("order_id");



CREATE INDEX "payments_status_idx" ON "public"."payments" USING "btree" ("status");



CREATE INDEX "payout_records_booster_idx" ON "public"."payout_records" USING "btree" ("booster_id");



CREATE UNIQUE INDEX "payout_records_order_unique_idx" ON "public"."payout_records" USING "btree" ("order_id");



CREATE INDEX "payout_records_status_idx" ON "public"."payout_records" USING "btree" ("status");



CREATE INDEX "profiles_role_idx" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "refunds_initiated_by_idx" ON "public"."refunds" USING "btree" ("initiated_by");



CREATE INDEX "refunds_order_id_idx" ON "public"."refunds" USING "btree" ("order_id");



CREATE INDEX "refunds_payment_id_idx" ON "public"."refunds" USING "btree" ("payment_id");



CREATE INDEX "reviews_booster_idx" ON "public"."reviews" USING "btree" ("booster_id");



CREATE INDEX "reviews_customer_id_idx" ON "public"."reviews" USING "btree" ("customer_id");



CREATE INDEX "reviews_public_idx" ON "public"."reviews" USING "btree" ("is_public") WHERE ("is_public" = true);



CREATE UNIQUE INDEX "service_extras_flow_code_idx" ON "public"."service_extras" USING "btree" ("flow", "code") WHERE (("flow" IS NOT NULL) AND ("code" IS NOT NULL));



CREATE INDEX "service_extras_service_id_idx" ON "public"."service_extras" USING "btree" ("service_id");



CREATE OR REPLACE TRIGGER "booster_profiles_lock_status" BEFORE UPDATE ON "public"."booster_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_non_admin_booster_status_change"();



CREATE OR REPLACE TRIGGER "clear_terminal_order_credentials_trigger" BEFORE UPDATE OF "status", "payment_status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."clear_terminal_order_credentials"();



CREATE OR REPLACE TRIGGER "order_completed_refresh_top5" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_order_completed_refresh_top5"();



CREATE OR REPLACE TRIGGER "reviews_refresh_booster_rating" AFTER INSERT OR DELETE OR UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_reviews_refresh_booster_rating"();



CREATE OR REPLACE TRIGGER "set_booster_applications_updated_at" BEFORE UPDATE ON "public"."booster_applications" FOR EACH ROW EXECUTE FUNCTION "public"."update_booster_applications_updated_at"();



CREATE OR REPLACE TRIGGER "set_booster_services_updated_at" BEFORE UPDATE ON "public"."booster_services" FOR EACH ROW EXECUTE FUNCTION "public"."update_booster_services_updated_at"();



CREATE OR REPLACE TRIGGER "set_duo_accounts_updated_at" BEFORE UPDATE ON "public"."duo_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_duo_accounts_updated_at"();



CREATE OR REPLACE TRIGGER "set_master_plus_pricing_updated_at" BEFORE UPDATE ON "public"."master_plus_pricing" FOR EACH ROW EXECUTE FUNCTION "public"."set_master_plus_pricing_updated_at"();



CREATE OR REPLACE TRIGGER "trg_booster_active_on_accept" AFTER UPDATE OF "assigned_booster_id" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_booster_active_on_accept"();



CREATE OR REPLACE TRIGGER "trg_booster_active_on_message" AFTER INSERT ON "public"."order_messages" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_booster_active_on_message"();



CREATE OR REPLACE TRIGGER "trg_cap_coach_packages" BEFORE INSERT ON "public"."booster_services" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_cap_coach_packages"();



CREATE OR REPLACE TRIGGER "trg_enforce_booster_display_name_cooldown" BEFORE UPDATE OF "display_name" ON "public"."booster_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_enforce_booster_display_name_cooldown"();



CREATE OR REPLACE TRIGGER "trg_guard_booster_profile_trust_columns" BEFORE UPDATE ON "public"."booster_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_guard_booster_profile_trust_columns"();



CREATE OR REPLACE TRIGGER "trg_guard_customer_profile_trust_columns" BEFORE UPDATE ON "public"."customer_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_guard_customer_profile_trust_columns"();



CREATE OR REPLACE TRIGGER "trg_guard_notifications_user_update" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_guard_notifications_user_update"();



CREATE OR REPLACE TRIGGER "trg_guard_profiles_trust_columns" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_guard_profiles_trust_columns"();



CREATE OR REPLACE TRIGGER "trg_order_completed_booster_stats" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_order_completed_booster_stats"();



CREATE OR REPLACE TRIGGER "trg_order_messages_rate_limit" BEFORE INSERT ON "public"."order_messages" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_enforce_message_rate_limit"();



CREATE OR REPLACE TRIGGER "trg_order_paid_customer_stats" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_order_paid_customer_stats"();



CREATE OR REPLACE TRIGGER "trg_reviews_rate_limit" BEFORE INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_enforce_review_rate_limit"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."booster_applications"
    ADD CONSTRAINT "booster_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booster_profiles"
    ADD CONSTRAINT "booster_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booster_services"
    ADD CONSTRAINT "booster_services_booster_id_fkey" FOREIGN KEY ("booster_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."duo_accounts"
    ADD CONSTRAINT "duo_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."master_plus_pricing"
    ADD CONSTRAINT "master_plus_pricing_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_drop_requests"
    ADD CONSTRAINT "order_drop_requests_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."order_drop_requests"
    ADD CONSTRAINT "order_drop_requests_booster_id_fkey" FOREIGN KEY ("booster_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."order_drop_requests"
    ADD CONSTRAINT "order_drop_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_messages"
    ADD CONSTRAINT "order_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_messages"
    ADD CONSTRAINT "order_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."order_rank_verifications"
    ADD CONSTRAINT "order_rank_verifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."order_rank_verifications"
    ADD CONSTRAINT "order_rank_verifications_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_assigned_booster_id_fkey" FOREIGN KEY ("assigned_booster_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_booster_service_id_fkey" FOREIGN KEY ("booster_service_id") REFERENCES "public"."booster_services"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_chat_locked_by_fkey" FOREIGN KEY ("chat_locked_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_preferred_booster_id_fkey" FOREIGN KEY ("preferred_booster_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."payout_records"
    ADD CONSTRAINT "payout_records_booster_id_fkey" FOREIGN KEY ("booster_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payout_records"
    ADD CONSTRAINT "payout_records_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booster_id_fkey" FOREIGN KEY ("booster_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."service_extras"
    ADD CONSTRAINT "service_extras_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id");



CREATE POLICY "admins_update_drop_requests" ON "public"."order_drop_requests" FOR UPDATE TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_admin_read" ON "public"."audit_logs" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "audit_logs_insert" ON "public"."audit_logs" FOR INSERT WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."booster_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booster_applications_admin_delete" ON "public"."booster_applications" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "booster_applications_admin_select" ON "public"."booster_applications" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "booster_applications_admin_update" ON "public"."booster_applications" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "booster_applications_select_own" ON "public"."booster_applications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."booster_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booster_profiles_read_own_or_admin" ON "public"."booster_profiles" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "booster_profiles_update_own_or_admin" ON "public"."booster_profiles" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."booster_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booster_services_owner_delete" ON "public"."booster_services" FOR DELETE USING (("booster_id" = "auth"."uid"()));



CREATE POLICY "booster_services_owner_insert" ON "public"."booster_services" FOR INSERT WITH CHECK (("booster_id" = "auth"."uid"()));



CREATE POLICY "booster_services_owner_update" ON "public"."booster_services" FOR UPDATE USING (("booster_id" = "auth"."uid"())) WITH CHECK (("booster_id" = "auth"."uid"()));



CREATE POLICY "booster_services_read" ON "public"."booster_services" FOR SELECT USING ((("booster_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."booster_profiles" "bp"
  WHERE (("bp"."user_id" = "booster_services"."booster_id") AND ("bp"."status" = 'approved'::"public"."booster_status"))))));



CREATE POLICY "boosters_select_own_drop_requests" ON "public"."order_drop_requests" FOR SELECT TO "authenticated" USING ((("booster_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."customer_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_profiles_insert_own" ON "public"."customer_profiles" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("total_orders" = 0) AND ("total_spent" = (0)::numeric)));



CREATE POLICY "customer_profiles_read_own" ON "public"."customer_profiles" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "customer_profiles_update_own" ON "public"."customer_profiles" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."duo_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "duo_accounts_admin_delete" ON "public"."duo_accounts" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "duo_accounts_admin_insert" ON "public"."duo_accounts" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "duo_accounts_admin_update" ON "public"."duo_accounts" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "duo_accounts_read" ON "public"."duo_accounts" FOR SELECT USING (("public"."is_admin"() OR ("is_active" AND (EXISTS ( SELECT 1
   FROM "public"."booster_profiles" "bp"
  WHERE (("bp"."user_id" = "auth"."uid"()) AND ("bp"."status" = 'approved'::"public"."booster_status")))))));



ALTER TABLE "public"."edge_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "games_admin_delete" ON "public"."games" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "games_admin_insert" ON "public"."games" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "games_admin_update" ON "public"."games" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "games_public_read" ON "public"."games" FOR SELECT USING ((("is_active" = true) OR "public"."is_admin"()));



ALTER TABLE "public"."master_plus_pricing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "master_plus_pricing_admin_delete" ON "public"."master_plus_pricing" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "master_plus_pricing_admin_insert" ON "public"."master_plus_pricing" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "master_plus_pricing_admin_update" ON "public"."master_plus_pricing" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "master_plus_pricing_read" ON "public"."master_plus_pricing" FOR SELECT USING ((("price" IS NOT NULL) OR "public"."is_admin"()));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_read_own" ON "public"."notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."order_drop_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_messages_read" ON "public"."order_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_messages"."order_id") AND ("o"."assigned_booster_id" IS NOT NULL) AND (("o"."customer_id" = "auth"."uid"()) OR ("o"."assigned_booster_id" = "auth"."uid"()) OR "public"."is_admin"())))));



ALTER TABLE "public"."order_rank_verifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_rank_verifications_read" ON "public"."order_rank_verifications" FOR SELECT USING ((("requested_by" = "auth"."uid"()) OR "public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_rank_verifications"."order_id") AND ("o"."customer_id" = "auth"."uid"()))))));



ALTER TABLE "public"."order_status_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_status_history_insert" ON "public"."order_status_history" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "order_status_history_read" ON "public"."order_status_history" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_status_history"."order_id") AND (("o"."customer_id" = "auth"."uid"()) OR ("o"."assigned_booster_id" = "auth"."uid"()))))) OR "public"."is_admin"()));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_customer_read" ON "public"."orders" FOR SELECT USING ((("customer_id" = "auth"."uid"()) OR ("assigned_booster_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "orders_update" ON "public"."orders" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_admin_delete" ON "public"."payments" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "payments_admin_insert" ON "public"."payments" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "payments_admin_update" ON "public"."payments" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "payments_read" ON "public"."payments" FOR SELECT USING ((("customer_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."payout_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payout_records_admin_update" ON "public"."payout_records" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "payout_records_read" ON "public"."payout_records" FOR SELECT USING ((("booster_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_read_own" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK ((("id" = "auth"."uid"()) AND ("role" = ( SELECT "profiles_1"."role"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))));



ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "refunds_read" ON "public"."refunds" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."payments" "p"
  WHERE (("p"."id" = "refunds"."payment_id") AND ("p"."customer_id" = "auth"."uid"())))) OR "public"."is_admin"()));



ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_customer_insert" ON "public"."reviews" FOR INSERT WITH CHECK ((("customer_id" = "auth"."uid"()) AND ("is_moderated" = false) AND ("admin_note" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "reviews"."order_id") AND ("o"."customer_id" = "auth"."uid"()) AND ("o"."status" = 'completed'::"public"."order_status") AND ("o"."assigned_booster_id" = "reviews"."booster_id"))))));



CREATE POLICY "reviews_public_read" ON "public"."reviews" FOR SELECT USING ((("is_public" = true) OR ("customer_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."service_extras" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_extras_admin_delete" ON "public"."service_extras" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "service_extras_admin_insert" ON "public"."service_extras" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "service_extras_admin_update" ON "public"."service_extras" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "service_extras_public_read" ON "public"."service_extras" FOR SELECT USING ((("is_active" = true) OR "public"."is_admin"()));



ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services_admin_delete" ON "public"."services" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "services_admin_insert" ON "public"."services" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "services_admin_update" ON "public"."services" FOR UPDATE USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "services_public_read" ON "public"."services" FOR SELECT USING ((("is_active" = true) OR "public"."is_admin"()));



CREATE POLICY "users_submit_own_application" ON "public"."booster_applications" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"text") AND ("admin_notes" IS NULL)));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_boost_order"("p_order_id" "uuid", "p_booster_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_boost_order"("p_order_id" "uuid", "p_booster_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_boost_order"("p_order_id" "uuid", "p_booster_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_dashboard_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_dashboard_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_dashboard_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_override_order_status"("p_order_id" "uuid", "p_new_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_override_order_status"("p_order_id" "uuid", "p_new_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_override_order_status"("p_order_id" "uuid", "p_new_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_order_chat_lock"("p_order_id" "uuid", "p_locked" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_order_chat_lock"("p_order_id" "uuid", "p_locked" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_order_chat_lock"("p_order_id" "uuid", "p_locked" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_booster"("p_booster_id" "uuid", "p_new_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_booster"("p_booster_id" "uuid", "p_new_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_booster"("p_booster_id" "uuid", "p_new_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."booster_active_slot_counts"("p_booster_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."booster_active_slot_counts"("p_booster_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."booster_active_slot_counts"("p_booster_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."booster_heartbeat"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."booster_heartbeat"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."booster_heartbeat"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."booster_has_active_exclusive_slot"("p_booster_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."booster_has_active_exclusive_slot"("p_booster_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."booster_has_active_exclusive_slot"("p_booster_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."booster_payout_summary"("p_booster_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."booster_payout_summary"("p_booster_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."booster_payout_summary"("p_booster_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_booster_accept_order"("p_booster_user_id" "uuid", "p_boost_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_booster_accept_order"("p_booster_user_id" "uuid", "p_boost_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_booster_accept_order"("p_booster_user_id" "uuid", "p_boost_mode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_own_write_rate_limit"("p_scope" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_own_write_rate_limit"("p_scope" "text", "p_limit" integer, "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_own_write_rate_limit"("p_scope" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_terminal_order_credentials"() TO "anon";
GRANT ALL ON FUNCTION "public"."clear_terminal_order_credentials"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_terminal_order_credentials"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_verified_order"("p_order_id" "uuid", "p_fetched_tier" "text", "p_fetched_division" "text", "p_requested_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_verified_order"("p_order_id" "uuid", "p_fetched_tier" "text", "p_fetched_division" "text", "p_requested_by" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_edge_rate_limit"("p_scope" "text", "p_subject" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_edge_rate_limit"("p_scope" "text", "p_subject" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_profile_exists"("p_display_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_profile_exists"("p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_profile_exists"("p_display_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_stale_pix_orders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_stale_pix_orders"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_duo_account_credentials"("p_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_duo_account_credentials"("p_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_duo_account_credentials"("p_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_order_chat"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_order_chat"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_chat"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_order_credentials"("p_order_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_customer_order_state"("p_order_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_customer_order_state"("p_order_id" "uuid") FROM "anon";
GRANT ALL ON FUNCTION "public"."get_customer_order_state"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_order_state"("p_order_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_order_credentials"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_credentials"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_approved_booster"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_approved_booster"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_approved_booster"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_match_result"("p_order_id" "uuid", "p_wins" integer, "p_losses" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_match_result"("p_order_id" "uuid", "p_wins" integer, "p_losses" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_match_result"("p_order_id" "uuid", "p_wins" integer, "p_losses" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."onboard_booster"("p_display_name" "text", "p_bio" "text", "p_peak_rank" "jsonb", "p_opgg_link" "text", "p_hours_per_day_min" integer, "p_hours_per_day_max" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."onboard_booster"("p_display_name" "text", "p_bio" "text", "p_peak_rank" "jsonb", "p_opgg_link" "text", "p_hours_per_day_min" integer, "p_hours_per_day_max" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."onboard_booster"("p_display_name" "text", "p_bio" "text", "p_peak_rank" "jsonb", "p_opgg_link" "text", "p_hours_per_day_min" integer, "p_hours_per_day_max" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."onboard_booster"("p_display_name" "text", "p_bio" "text", "p_peak_rank" "jsonb", "p_opgg_link" "text", "p_hours_per_day_min" integer, "p_hours_per_day_max" integer, "p_full_name" "text", "p_cpf" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."onboard_booster"("p_display_name" "text", "p_bio" "text", "p_peak_rank" "jsonb", "p_opgg_link" "text", "p_hours_per_day_min" integer, "p_hours_per_day_max" integer, "p_full_name" "text", "p_cpf" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."onboard_booster"("p_display_name" "text", "p_bio" "text", "p_peak_rank" "jsonb", "p_opgg_link" "text", "p_hours_per_day_min" integer, "p_hours_per_day_max" integer, "p_full_name" "text", "p_cpf" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."order_requires_access_token"("p_service_type" "public"."service_type", "p_boost_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."order_requires_access_token"("p_service_type" "public"."service_type", "p_boost_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."order_requires_access_token"("p_service_type" "public"."service_type", "p_boost_mode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_non_admin_booster_status_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_non_admin_booster_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_non_admin_booster_status_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_mp_payment_event"("p_order_id" "uuid", "p_mp_payment_id" "text", "p_provider_status" "text", "p_amount" numeric, "p_currency" "text", "p_event_id" "text", "p_refund_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_mp_payment_event"("p_order_id" "uuid", "p_mp_payment_id" "text", "p_provider_status" "text", "p_amount" numeric, "p_currency" "text", "p_event_id" "text", "p_refund_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rank_step"("p_tier" "text", "p_division" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rank_step"("p_tier" "text", "p_division" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rank_step"("p_tier" "text", "p_division" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_pix_payment"("p_order_id" "uuid", "p_customer_id" "uuid", "p_mp_payment_id" "text", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_pix_payment"("p_order_id" "uuid", "p_customer_id" "uuid", "p_mp_payment_id" "text", "p_amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_booster_rating"("p_booster_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_booster_rating"("p_booster_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_top5_boosters"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_top5_boosters"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_booster_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_booster_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_booster_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_order_drop"("p_order_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_order_drop"("p_order_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_order_drop"("p_order_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_drop_request"("p_request_id" "uuid", "p_approve" boolean, "p_admin_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_drop_request"("p_request_id" "uuid", "p_approve" boolean, "p_admin_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_drop_request"("p_request_id" "uuid", "p_approve" boolean, "p_admin_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_order_access_token"("p_access_token" "text", "p_booster_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_order_access_token"("p_access_token" "text", "p_booster_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_order_message"("p_order_id" "uuid", "p_content" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_order_message"("p_order_id" "uuid", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_order_message"("p_order_id" "uuid", "p_content" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_duo_account_credentials"("p_account_id" "uuid", "p_login" "text", "p_password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_duo_account_credentials"("p_account_id" "uuid", "p_login" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_duo_account_credentials"("p_account_id" "uuid", "p_login" "text", "p_password" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_master_plus_pricing_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_master_plus_pricing_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_master_plus_pricing_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_order_credentials"("p_order_id" "uuid", "p_login" "text", "p_password" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_order_credentials"("p_order_id" "uuid", "p_login" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_order_credentials"("p_order_id" "uuid", "p_login" "text", "p_password" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."toggle_booster_top5"("p_booster_id" "uuid", "p_is_top5" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."toggle_booster_top5"("p_booster_id" "uuid", "p_is_top5" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_booster_top5"("p_booster_id" "uuid", "p_is_top5" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_booster_active_on_accept"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_booster_active_on_accept"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_booster_active_on_accept"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_booster_active_on_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_booster_active_on_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_booster_active_on_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_cap_coach_packages"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_cap_coach_packages"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_cap_coach_packages"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_enforce_booster_display_name_cooldown"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_enforce_booster_display_name_cooldown"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_enforce_booster_display_name_cooldown"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_enforce_message_rate_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_enforce_message_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_enforce_message_rate_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_enforce_review_rate_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_enforce_review_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_enforce_review_rate_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_guard_booster_profile_trust_columns"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_guard_booster_profile_trust_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_guard_booster_profile_trust_columns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_guard_customer_profile_trust_columns"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_guard_customer_profile_trust_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_guard_customer_profile_trust_columns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_guard_notifications_user_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_guard_notifications_user_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_guard_notifications_user_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_guard_profiles_trust_columns"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_guard_profiles_trust_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_guard_profiles_trust_columns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_order_completed_booster_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_order_completed_booster_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_order_completed_booster_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_order_paid_customer_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_order_paid_customer_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_order_paid_customer_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_reviews_refresh_booster_rating"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_reviews_refresh_booster_rating"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_reviews_refresh_booster_rating"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_order_completed_refresh_top5"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_order_completed_refresh_top5"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_order_completed_refresh_top5"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_booster_applications_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_booster_applications_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_booster_applications_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_booster_services_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_booster_services_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_booster_services_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_duo_accounts_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_duo_accounts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_duo_accounts_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_my_username"("p_username" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_username"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_my_username"("p_username" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_order_status"("p_order_id" "uuid", "p_new_status" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON TABLE "public"."duo_accounts" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."duo_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."duo_accounts" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."duo_accounts" TO "authenticated";



GRANT SELECT("label") ON TABLE "public"."duo_accounts" TO "authenticated";



GRANT SELECT("current_rank") ON TABLE "public"."duo_accounts" TO "authenticated";



GRANT SELECT("is_active") ON TABLE "public"."duo_accounts" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."duo_accounts" TO "authenticated";



GRANT ALL ON TABLE "public"."admin_duo_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_duo_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."orders" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("customer_id") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("service_id") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("game_id") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("status") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("queue_type") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("boost_mode") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("server") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("current_rank") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("target_rank") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("wins_purchased") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("sessions_purchased") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("win_package") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("extras") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("base_price") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("extras_price") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("total_price") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("estimated_hours") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("customer_notes") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("booster_notes") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("wins_played") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("losses_played") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("assigned_booster_id") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("mp_payment_id") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("payment_status") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("credentials_set") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("discord_voice_channel_id") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("completed_at") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("current_pdl") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("pdl_bracket") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("avg_pdl_gain") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("avg_pdl_loss") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("pricing_version") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("idempotency_key") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("used_exclusive_slot") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("riot_id") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("booster_service_id") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("preferred_booster_id") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("exclusive_until") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("service_type") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("md5_matches_remaining") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("chat_locked") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("chat_locked_by") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("chat_locked_at") ON TABLE "public"."orders" TO "authenticated";



GRANT SELECT("credential_expires_at") ON TABLE "public"."orders" TO "authenticated";



GRANT ALL ON TABLE "public"."available_boost_orders" TO "anon";
GRANT ALL ON TABLE "public"."available_boost_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."available_boost_orders" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."booster_applications" TO "anon";
GRANT ALL ON TABLE "public"."booster_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."booster_applications" TO "service_role";



GRANT ALL ON TABLE "public"."booster_profiles" TO "anon";
GRANT ALL ON TABLE "public"."booster_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."booster_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."booster_services" TO "anon";
GRANT ALL ON TABLE "public"."booster_services" TO "authenticated";
GRANT ALL ON TABLE "public"."booster_services" TO "service_role";



GRANT ALL ON TABLE "public"."customer_profiles" TO "anon";
GRANT ALL ON TABLE "public"."customer_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."edge_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";



GRANT ALL ON TABLE "public"."master_plus_pricing" TO "anon";
GRANT ALL ON TABLE "public"."master_plus_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."master_plus_pricing" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."order_drop_requests" TO "anon";
GRANT ALL ON TABLE "public"."order_drop_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."order_drop_requests" TO "service_role";



GRANT ALL ON TABLE "public"."order_messages" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."order_messages" TO "service_role";



GRANT ALL ON TABLE "public"."order_rank_verifications" TO "anon";
GRANT ALL ON TABLE "public"."order_rank_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."order_rank_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."order_status_history" TO "anon";
GRANT ALL ON TABLE "public"."order_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."payout_records" TO "anon";
GRANT ALL ON TABLE "public"."payout_records" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_records" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."public_booster_profiles" TO "anon";
GRANT ALL ON TABLE "public"."public_booster_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."public_booster_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."refunds" TO "anon";
GRANT ALL ON TABLE "public"."refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."refunds" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."service_extras" TO "anon";
GRANT ALL ON TABLE "public"."service_extras" TO "authenticated";
GRANT ALL ON TABLE "public"."service_extras" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







