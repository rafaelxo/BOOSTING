import type { ServiceType } from '@/types'

export type CompletionBlockReason = 'no_matches_played' | 'clash_completion_window_closed' | 'objective_not_reached'

export interface CompletionGateOrder {
  service_type: ServiceType
  wins_played: number
  losses_played: number
  wins_purchased: number | null
  match_sync_started_at: string | null
}

const CLASH_TIMEZONE = 'America/Sao_Paulo'
const CLASH_UNLOCK_HOUR = 23

// Y/M/D/H of `date` as seen in `timeZone`'s local wall clock. Postgres has
// no `AT TIME ZONE` equivalent in JS beyond Intl -- formatToParts is the
// only reliable cross-runtime (browser + Deno) way to get this without a
// date library. hour12:false can report "24" for local midnight in some
// engines, normalized to 0 here.
function localParts(date: Date, timeZone: string): { y: number; m: number; d: number; h: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const hour = get('hour')
  return { y: get('year'), m: get('month'), d: get('day'), h: hour === 24 ? 0 : hour }
}

// Calendar day of `matchSyncStartedAt`'s local time zone, rolled forward one
// day if the order already started at/after the unlock hour that day --
// either way, the returned day is the FIRST day on which the window is open,
// and the window stays open every day from then on (no re-lock at midnight).
function clashUnlockDayEpoch(matchSyncStartedAt: string): number {
  const start = localParts(new Date(matchSyncStartedAt), CLASH_TIMEZONE)
  const startDayEpoch = Date.UTC(start.y, start.m - 1, start.d)
  return start.h >= CLASH_UNLOCK_HOUR ? startDayEpoch + 86_400_000 : startDayEpoch
}

export function clashCompletionUnlocked(matchSyncStartedAt: string, now: Date): boolean {
  const unlockDayEpoch = clashUnlockDayEpoch(matchSyncStartedAt)
  const current = localParts(now, CLASH_TIMEZONE)
  const nowDayEpoch = Date.UTC(current.y, current.m - 1, current.d)
  if (nowDayEpoch > unlockDayEpoch) return true
  if (nowDayEpoch < unlockDayEpoch) return false
  return current.h >= CLASH_UNLOCK_HOUR
}

export function canMarkOrderComplete(
  order: CompletionGateOrder,
  now: Date,
): { allowed: boolean; reason?: CompletionBlockReason } {
  if (order.service_type === 'coaching') return { allowed: true }

  if (order.service_type === 'clash') {
    if (!order.match_sync_started_at || !clashCompletionUnlocked(order.match_sync_started_at, now)) {
      return { allowed: false, reason: 'clash_completion_window_closed' }
    }
    return { allowed: true }
  }

  const hasMatchEvidence = order.wins_played + order.losses_played >= 1
  if (!hasMatchEvidence) return { allowed: false, reason: 'no_matches_played' }

  if (order.wins_purchased != null && order.wins_played < order.wins_purchased) {
    return { allowed: false, reason: 'objective_not_reached' }
  }

  return { allowed: true }
}
