-- ============================================================
-- Migration 002 — Fix service extras
-- Aligns DB extras with product decisions:
--   • Duo Boost     → removed (now a checkbox in the order builder)
--   • Solo Queue Only → removed
--   • Live Monitoring → removed
--   • Appear Offline  → removed (always included, not a paid extra)
--   • Priority Processing → renamed PT-BR + icon updated
--   • Mono Champion       → renamed PT-BR + icon updated
--   • Live Stream         → renamed PT-BR + icon updated
--   • Lane Específica     → NEW extra (free preference)
-- ============================================================

-- 1. Deactivate removed extras
update public.service_extras
set is_active = false
where name in (
  'Duo Boost',
  'Solo Queue Only',
  'Live Monitoring',
  'Appear Offline'
);

-- 2. Rename + update kept extras to PT-BR
update public.service_extras
set
  name        = 'Processamento Prioritário',
  description = 'Atribuição imediata ao booster mais bem avaliado. Seu pedido vai direto para frente da fila.',
  icon        = 'zap',
  sort_order  = 1
where name = 'Priority Processing';

update public.service_extras
set
  name        = 'Campeão Único',
  description = 'Seu campeão favorito em cada partida. Especifique nas observações do pedido.',
  icon        = 'crosshair',
  sort_order  = 2
where name = 'Mono Champion';

update public.service_extras
set
  name        = 'Transmissão ao Vivo',
  description = 'Assista seu booster jogar em tempo real via link de stream privado.',
  icon        = 'tv',
  sort_order  = 3
where name = 'Live Stream';

-- 3. Insert Lane Específica (idempotent — skip if already exists)
insert into public.service_extras
  (name, description, price_modifier, price_modifier_pct, sort_order, icon, is_active)
select
  'Lane Específica',
  'Informe a lane que deseja que o booster jogue. Combina perfeitamente com Campeão Único.',
  0, 0, 4, 'map-pin', true
where not exists (
  select 1 from public.service_extras where name = 'Lane Específica'
);
