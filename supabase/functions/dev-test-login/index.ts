// TEMPORÁRIO — utilitário só para o agente navegar autenticado durante o
// rebuild (o produto só usa Discord OAuth, ver src/features/auth/LoginPage.tsx
// e master-prompt seção 4.1). Gera um magic link para um e-mail de teste fixo
// via Admin API. Remover esta função antes de considerar o rebuild concluído.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { handleCors } from '../_shared/cors.ts'
import { errorResponse, jsonResponse } from '../_shared/responses.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { constantTimeEqual } from '../_shared/crypto.ts'

const TEST_EMAIL = 'dev-agent-test@eloboost.local'

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const expectedSecret = Deno.env.get('DEV_TEST_LOGIN_SECRET')
  const providedSecret = req.headers.get('x-dev-secret') ?? ''
  if (!expectedSecret || !constantTimeEqual(providedSecret, expectedSecret)) {
    return errorResponse(req, 'Unauthorized', 401)
  }

  try {
    const admin = supabaseAdmin()
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: TEST_EMAIL,
    })
    if (error || !data) {
      return errorResponse(req, error?.message ?? 'Failed to generate link', 500)
    }
    return jsonResponse(req, { action_link: data.properties.action_link, user_id: data.user.id, email: TEST_EMAIL })
  } catch (err) {
    return errorResponse(req, err instanceof Error ? err.message : 'Internal error', 500)
  }
})
