-- ============================================================
-- Migration — Reconciliação de schema (drift app ↔ migrations)
-- ============================================================
-- Nomeada com timestamp (em vez de número sequencial) porque o histórico de
-- migrations do banco remoto já tem versões 009-015 aplicadas que nunca
-- foram trazidas para este repositório (`supabase db push --dry-run` acusa
-- "Remote migration versions not found in local migrations directory").
-- O app usa request_booster_role(), a tabela booster_services e as colunas
-- lanes/specialties/can_coach/available_days em booster_profiles — nenhum
-- desses objetos está no histórico de migrations squashado em
-- 001_initializing.sql, embora já existam no banco de produção (confirmado
-- via `supabase gen types typescript --project-id ... --linked`, que não
-- precisa de Docker/senha do DB). Esta migration é idempotente
-- (CREATE ... IF NOT EXISTS / CREATE OR REPLACE) e as definições de coluna
-- abaixo replicam exatamente o shape já confirmado em produção, para que um
-- replay completo desta pasta (disaster recovery / ambiente novo) produza o
-- mesmo schema que já está rodando hoje.
--
-- As RLS policies de booster_services são recriadas explicitamente (drop +
-- create) mesmo já existindo em produção, para garantir que o que está
-- documentado aqui é exatamente o que está valendo — não foi possível
-- inspecionar as policies já aplicadas (apenas o schema de tabelas/funções é
-- exposto por `gen types`), então elas são reafirmadas do zero seguindo o
-- mesmo padrão de outras tabelas do projeto (dono via auth.uid(), leitura
-- pública restrita a boosters aprovados).

-- ─── 1. profiles.role: customer → booster ────────────────────────────────────
-- Usada em BoosterApplyPage.tsx ao iniciar a candidatura de booster.
-- Nunca aceita um role vindo do cliente — só promove o próprio auth.uid()
-- e só a partir de 'customer', igual ao guard já existente em
-- profiles_update_own contra auto-escalonamento de privilégio.

create or replace function public.request_booster_role()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if v_role is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if v_role <> 'customer' then
    return jsonb_build_object('success', false, 'error', 'invalid_role');
  end if;

  update public.profiles set role = 'booster', updated_at = now() where id = auth.uid();

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.request_booster_role() to authenticated;

-- ─── 2. booster_profiles: lanes, specialties, can_coach, available_days ─────
-- lanes/specialties: booster/pages/Services.tsx (Perfil Público do booster).
-- can_coach/available_days: booster/pages/Onboarding.tsx (etapa final do
-- cadastro, gravadas direto na tabela após a RPC onboard_booster).
-- Nullable sem default, igual ao shape já confirmado em produção.

alter table public.booster_profiles
  add column if not exists lanes          text[],
  add column if not exists specialties    text[],
  add column if not exists can_coach      boolean,
  add column if not exists available_days text[];

-- ─── 3. booster_services (catálogo de serviços próprios do booster) ─────────
-- Usada em booster/pages/Services.tsx (CRUD do próprio booster) e em
-- public/pages/BoosterPublicProfilePage.tsx (leitura pública).

create table if not exists public.booster_services (
  id           uuid primary key default gen_random_uuid(),
  booster_id   uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  description  text,
  tempo        text,
  price        numeric(10,2) not null default 0,
  created_at   timestamptz default now()
);

create index if not exists booster_services_booster_idx on public.booster_services(booster_id);

alter table public.booster_services enable row level security;

drop policy if exists "booster_services_owner_all" on public.booster_services;
create policy "booster_services_owner_all" on public.booster_services
  for all
  using (booster_id = auth.uid())
  with check (booster_id = auth.uid());

-- Leitura pública apenas dos serviços de boosters aprovados (sem PII nesta
-- tabela, então uma policy direta é suficiente — diferente do padrão de view
-- usado para booster_profiles na migration 004).
drop policy if exists "booster_services_public_read" on public.booster_services;
create policy "booster_services_public_read" on public.booster_services
  for select
  using (
    exists (
      select 1 from public.booster_profiles bp
      where bp.user_id = booster_services.booster_id
        and bp.status = 'approved'
    )
  );

grant select, insert, update, delete on public.booster_services to authenticated;
grant select on public.booster_services to anon;
