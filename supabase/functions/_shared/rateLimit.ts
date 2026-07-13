import { supabaseAdmin } from './supabaseAdmin.ts'

export async function consumeUserRateLimit(
  scope: string,
  userId: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const { data, error } = await supabaseAdmin().rpc('consume_edge_rate_limit', {
    p_scope: scope,
    p_subject: userId,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) throw new Error('Rate limit unavailable')
  const result = data as { allowed?: boolean; retry_after?: number } | null
  return {
    allowed: result?.allowed === true,
    retryAfter: Math.max(1, Number(result?.retry_after ?? windowSeconds)),
  }
}
