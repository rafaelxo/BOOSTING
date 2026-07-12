-- ============================================================
-- Migration — Pool de contas duo boost da empresa
-- ============================================================
-- Contas smurf de propriedade da empresa, disponibilizadas para
-- boosters aprovados usarem em serviços de Duo Boost. Login/senha
-- são criptografados com pgp_sym_encrypt usando a MESMA chave de
-- vault já usada para credenciais de pedido ('credential_key'),
-- seguindo o padrão da migration 003.

create table public.duo_accounts (
  id                     uuid primary key default gen_random_uuid(),
  game_id                text not null default 'lol',
  label                  text not null,                 -- ex.: "Conta Duo #3" — visível para o booster
  current_rank           jsonb,                          -- { tier, division } opcional, contexto pro booster
  notes                  text,                           -- observações internas (somente admin)
  encrypted_credentials  text,                           -- pgp_sym_encrypt(login||'|'||senha, chave)
  is_active              boolean not null default true,
  created_by             uuid references public.profiles(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index duo_accounts_active_idx on public.duo_accounts(is_active);

create or replace function public.update_duo_accounts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_duo_accounts_updated_at
  before update on public.duo_accounts
  for each row execute function public.update_duo_accounts_updated_at();

alter table public.duo_accounts enable row level security;

-- Leitura: admin sempre; booster aprovado só enquanto a conta estiver ativa.
create policy "duo_accounts_read" on public.duo_accounts for select using (
  public.is_admin()
  or (
    is_active
    and exists (
      select 1 from public.booster_profiles bp
      where bp.user_id = auth.uid() and bp.status = 'approved'
    )
  )
);

-- Escrita (insert/update/delete) de metadados: somente admin.
create policy "duo_accounts_admin_write" on public.duo_accounts for all using (public.is_admin());

-- ─── RPC: admin define/atualiza login+senha da conta duo ──────────────────────
create or replace function public.set_duo_account_credentials(
  p_account_id uuid,
  p_login      text,
  p_password   text
) returns jsonb
language plpgsql security definer set search_path = public as $$
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

-- ─── RPC: booster aprovado (ou admin) revela login+senha da conta duo ─────────
create or replace function public.get_duo_account_credentials(p_account_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
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

grant execute on function public.set_duo_account_credentials(uuid, text, text) to authenticated;
grant execute on function public.get_duo_account_credentials(uuid)             to authenticated;
