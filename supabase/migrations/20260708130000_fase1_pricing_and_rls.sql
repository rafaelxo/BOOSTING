-- ============================================================
-- Migration — Fase 1: preço autoritativo no servidor + RLS
-- ============================================================
-- Contexto: o preço do pedido era calculado inteiramente no browser e
-- inserido direto em `orders` pelo cliente, sem nenhuma validação
-- server-side. A partir desta migration, a criação de pedidos passa a ser
-- feita por uma Edge Function (create-pix-payment, com service role) que
-- recalcula o preço a partir de shared/pricing.ts — o cliente nunca mais
-- insere `orders` diretamente.

-- ─── 1. orders.win_package ────────────────────────────────────────────────────
-- Antes o pacote de vitórias escolhido no StepExtras era somado ao preço na
-- tela de revisão, mas nunca persistido no pedido nem cobrado de fato no
-- pagamento (cada etapa recalculava o preço de um jeito diferente). Agora o
-- preço é computado uma única vez no servidor e o pacote escolhido é
-- registrado explicitamente para booster/admin verem o que foi comprado.

alter table public.orders
  add column if not exists win_package smallint check (win_package in (1, 3, 5));

-- ─── 2. orders: cliente não insere mais direto ───────────────────────────────
-- Toda criação de pedido passa pela Edge Function create-pix-payment, que
-- usa a service role (bypassa RLS). Não há mais necessidade de policy de
-- INSERT para authenticated.

drop policy if exists "orders_customer_insert" on public.orders;

-- ─── 3. orders_update: só admin via client direto ────────────────────────────
-- Todas as transições de status legítimas (booster e admin) já passam pelas
-- RPCs SECURITY DEFINER update_order_status/admin_override_order_status/
-- accept_boost_order, que bypassam RLS. A policy anterior permitia que um
-- booster ou customer autenticado desse UPDATE direto na linha via
-- PostgREST/SDK, ignorando essas regras de transição — inclusive total_price
-- e status, sem passar pelas RPCs.

drop policy if exists "orders_update" on public.orders;
create policy "orders_update" on public.orders
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- ─── 4. audit_logs/order_status_history: só admin ou RPC via client direto ──
-- Essas tabelas são de auditoria; todo insert legítimo já acontece dentro de
-- RPCs SECURITY DEFINER (que bypassam RLS). A policy anterior deixava
-- qualquer usuário autenticado inserir uma linha de auditoria/histórico
-- fabricada para si mesmo via client direto.

drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs
  for insert
  with check (public.is_admin());

drop policy if exists "order_status_history_insert" on public.order_status_history;
create policy "order_status_history_insert" on public.order_status_history
  for insert
  with check (public.is_admin());
