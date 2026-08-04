-- Duo Boost passa a aceitar duas origens de conta: a "conta da plataforma"
-- (pool gerenciado em duo_accounts, já existente) ou a "conta própria" do
-- booster -- ele só informa o Riot ID, sem precisar de token (é a própria
-- conta dele, já tem acesso). duo_own_riot_id fica em orders porque é
-- 1:1 com o pedido, não um recurso reutilizável entre pedidos como as
-- contas da plataforma.

alter table public.orders add column duo_own_riot_id text;

create or replace function public.set_duo_own_riot_id(p_order_id uuid, p_riot_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order record;
  v_trimmed text;
begin
  select id, status, boost_mode, assigned_booster_id into v_order
  from public.orders where id = p_order_id for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;
  if v_order.assigned_booster_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;
  if v_order.boost_mode is distinct from 'duo' then
    return jsonb_build_object('success', false, 'error', 'not_duo_order');
  end if;
  if v_order.status not in ('assigned', 'in_progress', 'paused') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  v_trimmed := btrim(coalesce(p_riot_id, ''));
  -- Mesmo formato "Nome#TAG" validado no configurador do cliente
  -- (StepConfigure.tsx) -- precisa de conteúdo antes E depois do '#'.
  if length(v_trimmed) < 3 or length(v_trimmed) > 60
     or position('#' in v_trimmed) < 2
     or position('#' in v_trimmed) = length(v_trimmed) then
    return jsonb_build_object('success', false, 'error', 'invalid_riot_id');
  end if;

  update public.orders
    set duo_own_riot_id = v_trimmed, updated_at = now()
    where id = p_order_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.set_duo_own_riot_id(uuid, text) from public, anon;
grant execute on function public.set_duo_own_riot_id(uuid, text) to authenticated;

create or replace function public.clear_duo_own_riot_id(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order record;
begin
  select id, assigned_booster_id into v_order
  from public.orders where id = p_order_id for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;
  if v_order.assigned_booster_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  update public.orders set duo_own_riot_id = null, updated_at = now() where id = p_order_id;
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.clear_duo_own_riot_id(uuid) from public, anon;
grant execute on function public.clear_duo_own_riot_id(uuid) to authenticated;
