-- ============================================================
-- Migration — Align Duo Boost percentage with pricing engine
-- ============================================================

update public.service_extras
set
  description = replace(description, '+52%', '+50%'),
  price_modifier_pct = 50
where name = 'Duo Boost'
  and (price_modifier_pct = 52 or description like '%+52%%');
