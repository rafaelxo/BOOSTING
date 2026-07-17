import { supabase } from '@/lib/supabase'
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction'
import { normalizeApiError } from '@/api/core/errors'
import type { AdminDuoAccount, BoosterVisibleDuoAccount } from './types'

export async function listDuoAccounts<T = BoosterVisibleDuoAccount>(): Promise<T[]> {
  const { data, error } = await supabase.rpc('list_duo_accounts')
  if (error) throw normalizeApiError(error)
  const result = data as unknown as { success?: boolean; accounts?: T[]; error?: string }
  if (result.error) throw normalizeApiError(new Error(result.error))
  return result.accounts ?? []
}

export async function listAdminDuoAccounts(): Promise<AdminDuoAccount[]> {
  return listDuoAccounts<AdminDuoAccount>()
}

export interface RiotRankLookup {
  found?: boolean
  ranked?: boolean
  tier?: string
  division?: string | null
  league_points?: number
  avg_lp_gain?: number
  avg_lp_loss?: number
  message?: string
}

export async function lookupDuoAccountRiotRank(riotId: string): Promise<RiotRankLookup> {
  return invokeEdgeFunction<RiotRankLookup>('riot-account-rank', {
    body: { riot_id: riotId, queue: 'solo_duo' },
    requireAuth: true,
  })
}
