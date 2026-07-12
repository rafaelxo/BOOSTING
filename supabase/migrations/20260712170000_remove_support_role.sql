-- ============================================================
-- Migration — Remove o role 'support'; mantém apenas customer/booster/admin
-- ============================================================
-- Contexto: 'support' nunca teve comportamento distinto de 'admin' em
-- nenhum lugar do sistema — is_admin() sempre tratou os dois como
-- equivalentes (role in ('admin','support')), e o frontend redirecionava
-- support para o mesmo painel administrativo, com um workaround dedicado em
-- routeGuards.tsx só para evitar loop de redirect entre os dois papéis.
-- Decisão de produto: eliminar o role e consolidar tudo em admin.

-- ─── 1. Reatribuir linhas existentes com role/actor_role/sender_role =
--        'support' para 'admin', antes de remover o valor do enum ──────────
update public.profiles        set role        = 'admin' where role        = 'support';
update public.order_messages  set sender_role = 'admin' where sender_role = 'support';
update public.ticket_messages set sender_role = 'admin' where sender_role = 'support';
update public.audit_logs      set actor_role  = 'admin' where actor_role  = 'support';

-- ─── 2. Recriar o enum sem 'support' ─────────────────────────────────────────
-- Postgres não suporta DROP VALUE em enum — é preciso trocar o tipo inteiro.

create type public.user_role_new as enum ('customer', 'booster', 'admin');

alter table public.profiles alter column role drop default;
alter table public.profiles
  alter column role type public.user_role_new using role::text::public.user_role_new;
alter table public.profiles
  alter column role set default 'customer'::public.user_role_new;

alter table public.order_messages
  alter column sender_role type public.user_role_new using sender_role::text::public.user_role_new;

alter table public.ticket_messages
  alter column sender_role type public.user_role_new using sender_role::text::public.user_role_new;

alter table public.audit_logs
  alter column actor_role type public.user_role_new using actor_role::text::public.user_role_new;

drop type public.user_role;
alter type public.user_role_new rename to user_role;

-- ─── 3. Simplificar funções que checavam 'support' explicitamente ───────────
-- (CREATE OR REPLACE com o corpo completo original — só o teste de papel foi
-- simplificado; nenhuma outra regra de negócio foi alterada.)

create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
$$;

create or replace function public.booster_active_slot_counts(p_booster_user_id uuid)
returns table(solo_count integer, duo_count integer, total_count integer)
language plpgsql stable security definer set search_path = public as $$
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
      and status in ('assigned', 'in_progress', 'paused', 'awaiting_customer');
end;
$$;

create or replace function public.refresh_top5_boosters()
returns void
language plpgsql security definer set search_path = public as $$
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

-- ─── 4. RLS: "Admins can manage applications" usava check inline ────────────

drop policy if exists "Admins can manage applications" on public.booster_applications;
create policy "Admins can manage applications" on public.booster_applications
  for all using (public.is_admin());
