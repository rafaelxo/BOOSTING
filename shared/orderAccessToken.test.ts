import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')
const sql = readFileSync(join(root, 'supabase', 'migrations', '014_order_access_token_credentials.sql'), 'utf-8')

function functionBlock(name: string): string {
  const escaped = name.replace('.', '\\.')
  const match = sql.match(new RegExp(`create or replace function\\s+${escaped}[\\s\\S]*?\\n\\$\\$;`, 'i'))
  expect(match).not.toBeNull()
  return match![0]
}

describe('order access token hardening', () => {
  it('get_order_credentials retorna só token, nunca login/senha', () => {
    const block = functionBlock('public.get_order_credentials')
    expect(block).toContain("'access_token'")
    expect(block).not.toMatch(/'login'/i)
    expect(block).not.toMatch(/'password'/i)
    expect(block).not.toMatch(/pgp_sym_decrypt/i)
  })

  it('resolve_order_access_token é restrita a service_role', () => {
    expect(sql).toMatch(/revoke all on function public\.resolve_order_access_token\(text\) from public, anon, authenticated;/i)
    expect(sql).toMatch(/grant execute on function public\.resolve_order_access_token\(text\) to service_role;/i)
  })

  it('pedidos elegíveis só aparecem no pool quando credentials_set=true', () => {
    const viewStart = sql.indexOf('create or replace view public.available_boost_orders')
    const view = sql.slice(viewStart)
    expect(view).toMatch(/not public\.order_requires_access_token\(service_id, boost_mode\)\s+or credentials_set = true/i)
  })

  it('credenciais antigas são invalidadas para regenerar token no novo formato', () => {
    expect(sql).toMatch(/update public\.orders[\s\S]*set game_credentials = null,[\s\S]*credentials_set = false/i)
    expect(sql).toMatch(/public\.order_requires_access_token\(service_id, boost_mode\)/i)
  })

  it('serviços elegíveis excluem duo boost e coaching', () => {
    const block = functionBlock('public.order_requires_access_token')
    expect(block).toMatch(/p_service_id = 'elo_boost' and coalesce\(p_boost_mode, 'solo'\) = 'solo'/i)
    expect(block).toMatch(/p_service_id in \('win_boost', 'placement_matches', 'md5'\)/i)
    expect(block).not.toContain("'coaching'")
  })
})
