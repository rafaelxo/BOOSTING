# Edge Functions

## CORS

Browser-facing functions use the shared CORS helper in `_shared/cors.ts`.

Configure production origins with one of:

- `ALLOWED_ORIGINS`: comma-separated list, for example `https://elopeak.com,https://www.elopeak.com`
- `ALLOWED_ORIGIN`: single-origin fallback
- `APP_URL`, `PUBLIC_SITE_URL`, or `VERCEL_URL`: also accepted when present

Local development keeps `http://localhost:5173`, `http://localhost:4173`, `http://127.0.0.1:5173`, and `http://127.0.0.1:4173` allowed. If no production origin env var is set, production browser calls will not receive `Access-Control-Allow-Origin`; this is intentional to avoid falling back to `*` for authenticated/payment-related functions.

## Webhook Secrets

Discord webhook functions require `DISCORD_WEBHOOK_SECRET` and compare the `x-webhook-secret` header with constant-time comparison. If the secret is missing, the functions fail closed with `500`.

Mercado Pago webhook verification requires `MERCADOPAGO_WEBHOOK_SECRET` outside `DENO_ENV=development`.

## Limites e payloads

`create-pix-payment` aceita 6 requisições por usuário/minuto e `discord-join-server` 3 por usuário/5 minutos. Webhooks Discord possuem limites globais separados. Os contadores ficam em `public.edge_rate_limits`; excesso retorna `429` com `Retry-After`.

Funções HTTP aceitam somente `POST` (além de preflight CORS onde aplicável), JSON com `Content-Type: application/json`, payload limitado e chamadas externas com timeout. Não use `X-Forwarded-For` como identidade; os limites de browser usam o UUID autenticado.

## Pagamentos

O cliente envia `idempotency_key` UUID por tentativa. `create-pix-payment` valida jogo/serviço ativos, recalcula em centavos e registra pedido/pagamento pela RPC `record_pix_payment`. O webhook valida HMAC e timestamp, reconsulta a API do Mercado Pago e chama `process_mp_payment_event`, que reconcilia moeda, valor exato, pedido e payment ID em uma transação.

## Verificação de rank (Riot API)

`verify-order-rank` requer `RIOT_API_KEY` (chave server-side, nunca exposta ao cliente). Consulta a Account-V1 (Riot ID → puuid, roteamento `americas`) e a League-V4 by-puuid (roteamento `br1`, plataforma fixa — a plataforma hoje é 100% Brasil) pra confirmar se a fila `RANKED_SOLO_5x5` já bateu o `target_rank` do pedido. Só uma aprovação chama a RPC `complete_verified_order` (grant restrito a `service_role` — não é alcançável por um JWT de booster mesmo que ele tente chamar a RPC diretamente), que re-deriva a comparação de rank no próprio Postgres antes de aceitar.

Chaves de desenvolvedor da Riot têm rate limit baixo e **compartilhado entre toda a aplicação** (não por usuário) — algo como 20 req/1s e 100 req/2min. `verify-order-rank` já limita 5 tentativas/5min por booster (`consumeUserRateLimit`), mas isso não substitui solicitar uma chave de produção à Riot antes de um lançamento real com volume.
