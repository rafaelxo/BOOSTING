// Uso local apenas: gera um access_token/refresh_token de sessão para um
// usuário de teste existente, via Supabase Admin API (service_role key).
// Rode com: node scripts/gen-test-session.mjs <user_email_ou_id>
//
// SUPABASE_SERVICE_ROLE_KEY deve estar no seu ambiente (não commitar, não colar no chat).
// A saída (access_token/refresh_token) é uma sessão de curta duração do usuário
// de teste — ok compartilhar comigo, bem menos sensível que a service_role key.

const SUPABASE_URL = 'https://yrynfqjxqblrbxxiobty.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_SERVICE_ROLE_KEY no ambiente antes de rodar.')
  process.exit(1)
}

const userIdentifier = process.argv[2]
if (!userIdentifier) {
  console.error('Uso: node scripts/gen-test-session.mjs <user_id_ou_email>')
  process.exit(1)
}

const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({
    type: 'magiclink',
    email: userIdentifier,
  }),
})

const data = await res.json()
if (!res.ok) {
  console.error('Erro:', JSON.stringify(data, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({
  access_token: data.properties?.hashed_token ? undefined : data.access_token,
  action_link: data.properties?.action_link,
  user_id: data.id,
}, null, 2))
