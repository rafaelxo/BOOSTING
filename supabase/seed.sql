-- ============================================================
-- EloBoost — Seed Data (desenvolvimento local)
-- Cria usuários de teste para cada role
-- ============================================================

-- ATENÇÃO: só rodar em ambiente de DEV/local
-- As senhas abaixo são apenas para testes locais

-- 1. Usuários via auth.users (Supabase admin API ou SQL direto no local)
-- Em prod use o dashboard ou o script de seed separado

-- Inserir admin de teste
insert into auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, created_at, updated_at,
  aud, role
) values (
  '00000000-0000-0000-0000-000000000001',
  'admin@eloboost.test',
  crypt('Admin123!', gen_salt('bf')),
  now(),
  '{"role": "admin", "username": "admin"}'::jsonb,
  now(), now(),
  'authenticated', 'authenticated'
) on conflict (id) do nothing;

-- Inserir customer de teste
insert into auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, created_at, updated_at,
  aud, role
) values (
  '00000000-0000-0000-0000-000000000002',
  'customer@eloboost.test',
  crypt('Customer123!', gen_salt('bf')),
  now(),
  '{"role": "customer", "username": "testcustomer"}'::jsonb,
  now(), now(),
  'authenticated', 'authenticated'
) on conflict (id) do nothing;

-- Inserir booster de teste
insert into auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, created_at, updated_at,
  aud, role
) values (
  '00000000-0000-0000-0000-000000000003',
  'booster@eloboost.test',
  crypt('Booster123!', gen_salt('bf')),
  now(),
  '{"role": "booster", "username": "testbooster"}'::jsonb,
  now(), now(),
  'authenticated', 'authenticated'
) on conflict (id) do nothing;

-- Profiles são criados automaticamente pelo trigger handle_new_user
-- mas precisamos garantir que o admin seja admin de verdade
update public.profiles
set role = 'admin'
where id = '00000000-0000-0000-0000-000000000001';

-- Criar booster profile para o booster de teste
insert into public.booster_profiles (
  user_id, display_name, status, bio,
  peak_rank, current_rank,
  games, queue_preferences, region_preferences,
  total_completed, total_earnings, rating, rating_count,
  is_available
) values (
  '00000000-0000-0000-0000-000000000003',
  'TestBooster',
  'approved',
  'Diamond 1 ADC main, 3+ years boosting.',
  '{"tier": "diamond", "division": "I"}'::jsonb,
  '{"tier": "diamond", "division": "I"}'::jsonb,
  '{lol}',
  '{solo_duo, flex}',
  '{NA, EUW}',
  47, 1250.00, 4.90, 44,
  true
) on conflict (user_id) do nothing;

-- Criar customer profile para o customer de teste
insert into public.customer_profiles (
  user_id, display_name, total_orders, total_spent
) values (
  '00000000-0000-0000-0000-000000000002',
  'Test Customer', 0, 0
) on conflict (user_id) do nothing;

-- Ordem de teste (customer → booster)
insert into public.orders (
  id,
  customer_id,
  service_id,
  game_id,
  status,
  queue_type,
  server,
  current_rank,
  target_rank,
  extras,
  base_price,
  extras_price,
  total_price,
  estimated_hours,
  assigned_booster_id
) values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'elo_boost',
  'lol',
  'in_progress',
  'solo_duo',
  'NA',
  '{"tier": "silver", "division": "II"}'::jsonb,
  '{"tier": "gold", "division": "IV"}'::jsonb,
  '[]'::jsonb,
  19.99,
  0,
  19.99,
  12,
  '00000000-0000-0000-0000-000000000003'
) on conflict (id) do nothing;

-- Status history da ordem
insert into public.order_status_history (
  order_id, from_status, to_status, changed_by, reason
) values
  ('10000000-0000-0000-0000-000000000001', null, 'awaiting_payment', '00000000-0000-0000-0000-000000000002', 'Order created'),
  ('10000000-0000-0000-0000-000000000001', 'awaiting_payment', 'paid', '00000000-0000-0000-0000-000000000002', 'Payment confirmed'),
  ('10000000-0000-0000-0000-000000000001', 'paid', 'awaiting_assignment', '00000000-0000-0000-0000-000000000002', 'Queued'),
  ('10000000-0000-0000-0000-000000000001', 'awaiting_assignment', 'assigned', '00000000-0000-0000-0000-000000000003', 'Booster accepted'),
  ('10000000-0000-0000-0000-000000000001', 'assigned', 'in_progress', '00000000-0000-0000-0000-000000000003', 'Started')
on conflict do nothing;

-- Mensagens de teste na ordem
insert into public.order_messages (
  order_id, sender_id, sender_role, content, is_read
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'customer', 'Olá! Só usar Jinx ADC por favor!', true),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'booster', 'Pode deixar! Já comecei, 1 vitória feita.', false)
on conflict do nothing;

-- Review de teste
insert into public.reviews (
  order_id, customer_id, booster_id, rating, content, is_public, is_moderated
) values (
  -- ordem diferente completada
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  5,
  'Muito rápido e seguro, recomendo!',
  true, true
) on conflict (order_id) do nothing;
