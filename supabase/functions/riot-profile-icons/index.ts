import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { handleCors } from '../_shared/cors.ts'
import { errorResponse, jsonResponse, rateLimitResponse } from '../_shared/responses.ts'
import { getProfileIcons } from '../_shared/ddragon.ts'
import { consumeUserRateLimit } from '../_shared/rateLimit.ts'

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== 'GET') return errorResponse(req, 'Method not allowed', 405)

    // Endpoint público (sem login) — limita por IP só pra não sobrar
    // invocação/custo à toa; o resultado em si já é cacheado 6h em memória
    // (ver _shared/ddragon.ts), então isso nunca vira consulta repetida à
    // Riot/CommunityDragon, só protege a function em si.
    // cf-connecting-ip (quando presente) é setado pela borda da Cloudflare e
    // não pode ser forjado pelo cliente; x-forwarded-for é enviado pelo
    // próprio cliente, então o primeiro valor da lista é livremente
    // controlável por quem faz a chamada — usamos o ÚLTIMO valor (o hop mais
    // próximo do nosso proxy confiável) como fallback, nunca o primeiro.
    const forwardedFor = req.headers.get('x-forwarded-for')?.split(',').map((v) => v.trim()).filter(Boolean) ?? []
    const clientIp = req.headers.get('cf-connecting-ip')
      || forwardedFor[forwardedFor.length - 1]
      || 'unknown'
    const rateLimit = await consumeUserRateLimit('riot-profile-icons', clientIp, 30, 60)
    if (!rateLimit.allowed) return rateLimitResponse(req, rateLimit.retryAfter)

    const { version, icons, stale } = await getProfileIcons()
    return jsonResponse(req, { version, icons, stale })
  } catch (err) {
    console.error('riot-profile-icons error', err instanceof Error ? err.message : 'unknown')
    return errorResponse(req, 'Não foi possível carregar os ícones de perfil agora.', 502)
  }
})
