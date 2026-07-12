-- ============================================================
-- Migration — Trava colunas de confiança/financeiras em customer_profiles
-- e booster_profiles contra auto-alteração via UPDATE direto do cliente
-- ============================================================
-- Contexto: a migration 20260708130000_fase1_pricing_and_rls.sql travou
-- `orders` e `audit_logs`/`order_status_history` contra UPDATE/INSERT direto
-- do cliente pelo mesmo motivo (RPCs SECURITY DEFINER já bypassam RLS para
-- todas as transições legítimas). O mesmo problema nunca foi corrigido em
-- `customer_profiles` e `booster_profiles`: as policies
-- "customer_profiles_update_own" e "booster_profiles_update_own_or_admin"
-- não têm WITH CHECK, então qualquer authenticated pode, via
-- supabase.from('booster_profiles').update({...}) direto do browser,
-- alterar total_earnings, total_completed, rating, rating_count, is_top5,
-- status, verified_at, current_rank e rank_stats da própria linha — mesmo
-- que nenhuma tela do app faça isso hoje (essas colunas só são escritas por
-- RPCs approve_booster/toggle_booster_top5, pela Edge de admin em
-- BoosterDetail.tsx, ou pelas triggers de stats da fase 2). O mesmo vale
-- para total_orders/total_spent em customer_profiles, que só devem mudar
-- via trg_fn_order_paid_customer_stats.
--
-- Correção: trigger BEFORE UPDATE que reverte essas colunas para o valor
-- anterior quando quem está executando não é admin/support (is_admin()) nem
-- um contexto de sistema (service_role, RPC SECURITY DEFINER, pg_cron,
-- migration — nenhum desses roda como `authenticated`). Nenhuma coluna de
-- autoatendimento legítimo (display_name, bio, lanes, specialties, cpf,
-- full_name, can_coach, available_days, is_available, preferências, etc.)
-- é afetada.

create or replace function public.trg_fn_guard_booster_profile_trust_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Contextos de sistema (service_role, RPCs SECURITY DEFINER, pg_cron,
  -- migrations) nunca executam como `authenticated` — só o cliente logado
  -- direto (dono da linha) cai aqui, então só ele precisa ser checado.
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

drop trigger if exists trg_guard_booster_profile_trust_columns on public.booster_profiles;
create trigger trg_guard_booster_profile_trust_columns
  before update on public.booster_profiles
  for each row execute function public.trg_fn_guard_booster_profile_trust_columns();

create or replace function public.trg_fn_guard_customer_profile_trust_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    new.total_orders := old.total_orders;
    new.total_spent  := old.total_spent;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_customer_profile_trust_columns on public.customer_profiles;
create trigger trg_guard_customer_profile_trust_columns
  before update on public.customer_profiles
  for each row execute function public.trg_fn_guard_customer_profile_trust_columns();

-- ─── Defense in depth: search_path explícito nos helpers SECURITY DEFINER ──
-- Não eram exploráveis hoje (todas as referências já são schema-qualificadas
-- como public.profiles), mas fixar search_path é a prática recomendada para
-- toda função SECURITY DEFINER e elimina a categoria de risco por completo.

create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'support')
  )
$$;
