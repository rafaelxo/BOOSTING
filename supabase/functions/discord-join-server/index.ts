import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { z } from 'https://esm.sh/zod@3.23.8'
import { handleCors } from '../_shared/cors.ts'
import { errorResponse, jsonResponse, rateLimitResponse } from '../_shared/responses.ts'
import { getAuthUser } from '../_shared/authUser.ts'
import { consumeUserRateLimit } from '../_shared/rateLimit.ts'
import { fetchWithTimeout, HttpError, readJsonBody } from '../_shared/http.ts'

const DISCORD_API = 'https://discord.com/api/v10'
const GUILD_ID = Deno.env.get('DISCORD_GUILD_ID') ?? ''
const BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN') ?? ''

const bodySchema = z.object({
  discord_access_token: z.string().min(1).max(4096),
}).strict()

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== 'POST') return errorResponse(req, 'Method not allowed', 405)
    if (!GUILD_ID || !BOT_TOKEN) {
      return errorResponse(req, 'Server misconfigured', 500)
    }

    const auth = await getAuthUser(req.headers.get('Authorization'))
    if (!auth) return errorResponse(req, 'Unauthorized', 401)

    const rateLimit = await consumeUserRateLimit('discord-join-server', auth.user.id, 3, 300)
    if (!rateLimit.allowed) return rateLimitResponse(req, rateLimit.retryAfter)

    const rawBody = await readJsonBody(req, 8 * 1024)

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
    const meRes = await fetchWithTimeout(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${discord_access_token}` },
    })
    if (!meRes.ok) return errorResponse(req, 'Invalid Discord token', 400)
    const { id: discordUserId } = await meRes.json() as { id: string }

    const discordIdentity = auth.user.identities?.find((identity) => identity.provider === 'discord')
    const expectedDiscordId = discordIdentity?.identity_id
      ?? auth.user.user_metadata?.provider_id
      ?? auth.user.user_metadata?.sub
    if (!expectedDiscordId || String(expectedDiscordId) !== discordUserId) {
      return errorResponse(req, 'Discord identity mismatch', 403)
    }

    // Add user to the guild (bot must already be in the server)
    const joinRes = await fetchWithTimeout(`${DISCORD_API}/guilds/${GUILD_ID}/members/${discordUserId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: discord_access_token }),
    })

    // 201 = joined, 204 = already a member — both are success
    if (!joinRes.ok && joinRes.status !== 201 && joinRes.status !== 204) {
      console.error(`Discord join failed with status ${joinRes.status}`)
      return errorResponse(req, 'Unable to join Discord server', 502)
    }

    return jsonResponse(req, { joined: true })
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(req, err.message, err.status)
    console.error('discord-join-server error')
    return errorResponse(req, 'Internal server error', 500)
  }
})
