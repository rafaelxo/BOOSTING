import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { handleCors } from '../_shared/cors.ts'
import { errorResponse, jsonResponse } from '../_shared/responses.ts'
import { getProfileIcons } from '../_shared/ddragon.ts'

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== 'GET') return errorResponse(req, 'Method not allowed', 405)
    const { version, icons, stale } = await getProfileIcons()
    return jsonResponse(req, { version, icons, stale })
  } catch (err) {
    console.error('riot-profile-icons error', err instanceof Error ? err.message : 'unknown')
    return errorResponse(req, 'Não foi possível carregar os ícones de perfil agora.', 502)
  }
})
