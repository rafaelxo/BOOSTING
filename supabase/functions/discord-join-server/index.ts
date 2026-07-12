import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { z } from 'https://esm.sh/zod@3.23.8'
import { handleCors } from '../_shared/cors.ts'
import { errorResponse, jsonResponse } from '../_shared/responses.ts'
import { getAuthUser } from '../_shared/authUser.ts'

const DISCORD_API = 'https://discord.com/api/v10'
const GUILD_ID = Deno.env.get('DISCORD_GUILD_ID') ?? ''
const BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN') ?? ''

const bodySchema = z.object({
  discord_access_token: z.string().min(1, 'discord_access_token é obrigatório'),
})

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (!GUILD_ID || !BOT_TOKEN) {
      return errorResponse(req, 'Server misconfigured', 500)
    }

    const auth = await getAuthUser(req.headers.get('Authorization'))
    if (!auth) return errorResponse(req, 'Unauthorized', 401)

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return errorResponse(req, 'JSON inválido', 400)
    }

    const parsedBody = bodySchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return jsonResponse(req, {
        error: 'Body inválido',
        issues: parsedBody.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      }, 400)
    }

    const { discord_access_token } = parsedBody.data

    // Resolve Discord user ID from the access token
    const meRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${discord_access_token}` },
    })
    if (!meRes.ok) throw new Error('Failed to fetch Discord user')
    const { id: discordUserId } = await meRes.json() as { id: string }

    // Add user to the guild (bot must already be in the server)
    const joinRes = await fetch(`${DISCORD_API}/guilds/${GUILD_ID}/members/${discordUserId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: discord_access_token }),
    })

    // 201 = joined, 204 = already a member — both are success
    if (!joinRes.ok && joinRes.status !== 201 && joinRes.status !== 204) {
      const body = await joinRes.text()
      console.error(`Discord join failed ${joinRes.status}:`, body)
      throw new Error('Não foi possível vincular o usuário ao servidor Discord')
    }

    return jsonResponse(req, { joined: true })
  } catch (err) {
    return errorResponse(req, (err as Error).message, 400)
  }
})
