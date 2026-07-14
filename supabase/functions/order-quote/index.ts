import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { z } from 'https://esm.sh/zod@3.23.8'
import { handleCors } from '../_shared/cors.ts'
import { errorResponse, jsonResponse, rateLimitResponse } from '../_shared/responses.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { getAuthUser } from '../_shared/authUser.ts'
import { readJsonBody } from '../_shared/http.ts'
import { consumeUserRateLimit } from '../_shared/rateLimit.ts'
import { validateAndPriceIntent } from '../_shared/orderPricing.ts'

const RIOT_API_KEY = Deno.env.get('RIOT_API_KEY') ?? ''

const requestSchema = z.object({
  intent: z.record(z.unknown()),
}).strict()

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== 'POST') return errorResponse(req, 'Method not allowed', 405)

    const auth = await getAuthUser(req.headers.get('Authorization'))
    if (!auth) return errorResponse(req, 'Unauthorized', 401)

    // Cotação é read-only mas ainda consulta a Riot (MD5) — mesmo limite
    // generoso de create-pix-payment, não o limite apertado de riot-account-rank,
    // já que o usuário pode re-cotar ao ajustar campos.
    const rateLimit = await consumeUserRateLimit('order-quote', auth.user.id, 20, 60)
    if (!rateLimit.allowed) return rateLimitResponse(req, rateLimit.retryAfter)

    const rawBody = await readJsonBody(req)
    const parsed = requestSchema.safeParse(rawBody)
    if (!parsed.success) {
      return jsonResponse(req, {
        error: 'Body inválido',
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      }, 400)
    }

    const serviceClient = supabaseAdmin()
    const outcome = await validateAndPriceIntent(req, parsed.data.intent, auth.user.id, serviceClient, RIOT_API_KEY, null)
    if (!outcome.ok) return outcome.response

    const { normalized, priced, md5MatchesRemaining } = outcome
    // Percentual "aplicado" exposto na cotação é só informativo, calculado a
    // partir da razão entre o total pré-modificador (base sem LP) e o preço
    // final — computeOrderPrice já aplica o modificador internamente, não há
    // um segundo cálculo aqui, apenas a exposição do resultado.
    return jsonResponse(req, {
      service_type: normalized.serviceType,
      queue_type: normalized.queueType,
      current_rank: normalized.currentRank,
      target_rank: normalized.targetRank,
      md5_detected: normalized.serviceType === 'md5',
      md5_matches_remaining: md5MatchesRemaining,
      quantity: normalized.winsPurchased ?? 1,
      unit_price: priced.basePrice / Math.max(1, normalized.winsPurchased ?? 1),
      subtotal: priced.basePrice,
      extras_price: priced.extrasPrice,
      total: priced.totalPrice,
      // Percentual de modificador de PDL já aplicado ao basePrice — null
      // quando o modificador não se aplica (Master+ ou serviceType != elo_boost).
      modifier_pct: priced.pdlModifierPct,
      currency: 'BRL',
      pricing_version: 'v2',
    })
  } catch (err) {
    console.error('order-quote error', err instanceof Error ? err.name : 'unknown')
    return errorResponse(req, 'Internal server error', 500)
  }
})
