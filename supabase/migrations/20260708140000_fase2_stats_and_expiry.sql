-- ============================================================
-- Migration — Fase 2: estatísticas agregadas + expiração de pedidos
-- ============================================================
-- Contexto: customer_profiles.total_orders/total_spent e
-- booster_profiles.total_completed/total_earnings nunca eram incrementados
-- em lugar nenhum do código (só existia lógica para *decrementar* em
-- resolve_drop_request). payout_records também nunca era escrito — a tela
-- de ganhos do booster (Earnings.tsx) sempre mostrava vazio. Além disso,
-- pedidos que ficam esperando pagamento e nunca são pagos (usuário fecha a
-- aba, PIX expira) ficavam presos em `awaiting_payment` para sempre — não
-- existe status "expired" no enum, e nenhuma rotina limpava isso.

-- ─── 1. Stats do cliente: no momento em que o pagamento é confirmado ────────
-- (transição awaiting_payment → awaiting_assignment, feita pelo webhook do MP)

create or replace function public.trg_fn_order_paid_customer_stats()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status = 'awaiting_assignment' and OLD.status = 'awaiting_payment' then
    update public.customer_profiles
      set total_orders = total_orders + 1,
          total_spent  = total_spent + NEW.total_price
      where user_id = NEW.customer_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_order_paid_customer_stats on public.orders;
create trigger trg_order_paid_customer_stats
  after update of status on public.orders
  for each row execute function public.trg_fn_order_paid_customer_stats();

-- ─── 2. Stats do booster + payout_records: no momento da conclusão ──────────
-- Comissão de 25% (mesmo default já usado na coluna payout_records.commission_rate).

create or replace function public.trg_fn_order_completed_booster_stats()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_order_completed_booster_stats on public.orders;
create trigger trg_order_completed_booster_stats
  after update of status on public.orders
  for each row execute function public.trg_fn_order_completed_booster_stats();

-- ─── 3. Expiração de pedidos presos em awaiting_payment ─────────────────────
-- Não existe status "expired" no enum order_status — o mais próximo
-- semanticamente é "canceled" (nunca chegou a ser pago). O PIX em si expira
-- em 30 min (StepPayment.tsx / create-pix-payment), então 35 min de folga
-- garante que não cancelamos um pedido que ainda pode ser pago.

create or replace function public.expire_stale_pix_orders()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders
  set status = 'canceled', updated_at = now()
  where status = 'awaiting_payment'
    and created_at < now() - interval '35 minutes';
end;
$$;

do $$
begin
  create extension if not exists pg_cron;
exception when insufficient_privilege then
  raise notice 'pg_cron could not be enabled (insufficient privilege) — schedule expire_stale_pix_orders() manually';
end $$;

do $$
begin
  perform cron.unschedule('expire-stale-pix-orders');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.schedule(
    'expire-stale-pix-orders',
    '*/10 * * * *',
    $cron$select public.expire_stale_pix_orders();$cron$
  );
exception when others then
  raise notice 'pg_cron scheduling unavailable — expire_stale_pix_orders() exists but is not scheduled';
end $$;
