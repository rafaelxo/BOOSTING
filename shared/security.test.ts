import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { constantTimeEqual } from '../supabase/functions/_shared/crypto'
import { HttpError, readJsonBody } from '../supabase/functions/_shared/http'

describe('Edge HTTP hardening', () => {
  it('compares webhook secrets correctly for equal and unequal lengths', () => {
    expect(constantTimeEqual('same-secret', 'same-secret')).toBe(true)
    expect(constantTimeEqual('same-secret', 'same-secreu')).toBe(false)
    expect(constantTimeEqual('short', 'longer-secret')).toBe(false)
  })

  it('rejects non-JSON and oversized bodies', async () => {
    await expect(readJsonBody(new Request('http://local.test', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    }))).rejects.toMatchObject({ status: 415 } satisfies Partial<HttpError>)

    await expect(readJsonBody(new Request('http://local.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(128) }),
    }), 32)).rejects.toMatchObject({ status: 413 } satisfies Partial<HttpError>)
  })

  it('parses a bounded JSON object', async () => {
    await expect(readJsonBody(new Request('http://local.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: '{"ok":true}',
    }))).resolves.toEqual({ ok: true })
  })
})

describe('Database authorization migration', () => {
  it('locks trust fields and projects available orders without sensitive columns', async () => {
    const sql = await readFile(
      new URL('../supabase/migrations/007_security_integrity_and_payment_atomicity.sql', import.meta.url),
      'utf8',
    )
    expect(sql).toContain('drop policy if exists "booster_profiles_insert_own"')
    expect(sql).toContain('sender_role = public.current_user_role()')
    expect(sql).toContain('o.assigned_booster_id = booster_id')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('process_mp_payment_event')

    const projection = sql.slice(
      sql.indexOf('create or replace view public.available_boost_orders'),
      sql.indexOf('revoke all on public.available_boost_orders'),
    )
    expect(projection).not.toContain('customer_id')
    expect(projection).not.toContain('game_credentials')
    expect(projection).not.toContain('mp_payment_id')
  })
})
