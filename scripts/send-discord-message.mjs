// Uso local apenas: posta uma mensagem estruturada (embed) num canal do
// Discord via bot, a partir de um arquivo JSON no formato nativo da API do
// Discord: { content?, embeds?: [...] } — ou um array desses objetos, pra
// mandar várias mensagens em sequência.
//
// DISCORD_BOT_TOKEN deve estar no seu ambiente (não commitar, não colar no chat).
//
// Rode primeiro sem --send pra conferir o payload:
//   node scripts/send-discord-message.mjs <channel_id> <arquivo.json>
// Quando estiver ok, envia de verdade:
//   node scripts/send-discord-message.mjs <channel_id> <arquivo.json> --send

import { readFile } from 'node:fs/promises'

const SEND_DELAY_MS = 700

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const [channelId, filePath, flag] = process.argv.slice(2)
const shouldSend = flag === '--send'

if (!channelId || !filePath) {
  console.error('Uso: node scripts/send-discord-message.mjs <channel_id> <arquivo.json> [--send]')
  process.exit(1)
}

if (shouldSend && !BOT_TOKEN) {
  console.error('Defina DISCORD_BOT_TOKEN no ambiente antes de rodar com --send.')
  process.exit(1)
}

// Embeds só aceitam cor como inteiro decimal -- deixa o JSON usar "#22C55E"
// que fica bem mais legível de escrever/revisar do que 2278750.
function resolveColors(payload) {
  for (const embed of payload.embeds ?? []) {
    if (typeof embed.color === 'string') {
      embed.color = parseInt(embed.color.replace('#', ''), 16)
    }
  }
  return payload
}

async function sendMessage(payload) {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bot ${BOT_TOKEN}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(`Falha ao enviar (status ${res.status}): ${JSON.stringify(data)}`)
  }
}

const raw = JSON.parse(await readFile(filePath, 'utf-8'))
const messages = (Array.isArray(raw) ? raw : [raw]).map(resolveColors)

console.log(`${messages.length} mensagem(ns) — ${shouldSend ? 'enviando pro canal ' + channelId : 'modo preview, nada será enviado'}\n`)

for (const [i, payload] of messages.entries()) {
  console.log(`--- mensagem ${i + 1}/${messages.length} ---`)
  console.log(JSON.stringify(payload, null, 2))
  console.log()

  if (shouldSend) {
    await sendMessage(payload)
    console.log(`✓ mensagem ${i + 1} enviada`)
    if (i < messages.length - 1) await new Promise((r) => setTimeout(r, SEND_DELAY_MS))
  }
}

if (shouldSend) console.log('\nPronto — todas as mensagens enviadas.')
