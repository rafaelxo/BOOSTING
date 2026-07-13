# Auditoria de Segurança

## 1. Resumo executivo

Auditoria estática e dinâmica local do frontend React, acesso Supabase, migrations PostgreSQL, RLS, RPCs, preços e cinco Edge Functions. Foram corrigidas falhas de autorização/mass assignment, exposição excessiva de pedidos e contas Duo, concorrência no aceite de vagas, aritmética monetária, idempotência e atomicidade PIX, replay de webhook, payloads sem limite, timeouts ausentes e headers HTTP.

## 2. Escopo e arquitetura

SPA Vite/React 18 com React Router, React Query e Zustand. Supabase fornece Discord OAuth, PostgreSQL/PostgREST/RLS e Edge Functions Deno. Mercado Pago cria PIX e notifica webhook; Discord recebe token OAuth e webhooks internos. Não há fila dedicada, upload ativo ou backend Node separado.

Fluxos críticos revisados: sessão/roles, aceite legal, criação/consulta/aceite/status de pedidos, mensagens, credenciais criptografadas, catálogo/admin, preço/addons/Master+, pagamento/reembolso e contas Duo.

## 3. Vulnerabilidades encontradas e correções

| Severidade | Achado | Arquivos | Correção |
|---|---|---|---|
| Crítico | Booster podia inserir o próprio perfil já `approved` e preencher colunas de confiança | migrations 001/007 | Removida policy de insert direto; onboarding permanece em RPC autorizada |
| Alto | Mensagens aceitavam `sender_role` falsificado; tickets/reviews aceitavam colunas administrativas | migrations 001/007 | Policies correlacionam role, ownership, estado inicial e booster do pedido |
| Alto | Qualquer booster aprovado lia todas as colunas de vagas, incluindo IDs/metadata/ciphertext | migrations 004/007, AvailableJobs, JobDetail | Policy ampla removida; view com projeção operacional mínima |
| Alto | `duo_accounts` expunha notes/ciphertext apesar da seleção restrita da UI | migration 007, DuoAccounts | Revogado SELECT amplo; grants por coluna e view exclusiva de admin |
| Alto | Registro PIX era não atômico e fazia upsert sem unique em `order_id` | create-pix-payment, migration 007 | Unique constraint e RPC transacional `record_pix_payment` |
| Alto | Webhook atualizava pagamento/pedido/efeitos em operações independentes | mercadopago-webhook, migration 007 | RPC transacional com reconciliação exata de moeda, valor e payment ID |
| Médio | Assinatura Mercado Pago não limitava idade/replay | mercadopago-webhook | Timestamp normalizado e janela de 10 minutos |
| Médio | Repetição de intenção podia criar pedidos duplicados | StepPayment, create-pix-payment, migration 007 | UUID de idempotência por tentativa e unique por customer |
| Médio | Aceites simultâneos em pedidos diferentes excediam slots do booster | migration 007 | Advisory transaction lock por booster antes da contagem |
| Médio | Edge Functions sem limites reais, body limit ou timeouts | `_shared`, Edge Functions | Limite PostgreSQL por usuário/escopo, 429, JSON limitado e abort timeout |
| Médio | Serviço/jogo eram metadata arbitrária enviada pelo cliente | create-pix-payment | UUID e correlação com catálogo ativo/tipo validada no servidor |
| Médio | Valores monetários usavam somas binárias | shared/pricing | Conversão/rounding em centavos inteiros e validação de finitude/faixas |
| Médio | Sem headers de segurança e erro React expunha mensagem em produção | vercel.json, main.tsx | CSP, HSTS, frame/nosniff/referrer/permissions e erro genérico |
| Baixo | Oito pacotes Radix não usados aumentavam supply chain/bundle | package.json/lock, vite.config | Dependências e chunk removidos |
| Baixo | Config Vite dependia de `__dirname` em ESM | vite/vitest config | `import.meta.url` e config runner |

Não foram encontrados `dangerouslySetInnerHTML`, `eval`, secrets versionados, SQL montado por concatenação, command execution por input, upload ativo ou service role no frontend. React faz escaping contextual do texto exibido; redirects OAuth/aceite aceitam somente path same-origin.

## 4. Banco e integridade

A migration `007_security_integrity_and_payment_atomicity.sql` adiciona constraints não negativas, limites de texto, unique de pagamento/payout/drop pendente, idempotência, views mínimas, policies e RPCs. Constraints de domínio são `NOT VALID`: protegem novas escritas, mas dados antigos devem ser auditados e validados posteriormente com `ALTER TABLE ... VALIDATE CONSTRAINT`. A criação dos índices únicos interromperá a migration, sem apagar dados, se já houver duplicidades; faça a verificação de preflight descrita no README antes de aplicá-la.

## 5. Rate limiting

- PIX: 6/user/minuto.
- Discord join: 3/user/5 minutos.
- Discord order webhook: 120/minuto global.
- Discord init: 1/5 minutos global.

Os limites usam identidade autenticada ou escopo interno e não confiam em `X-Forwarded-For`. Eles não substituem CDN/WAF, limites de conexão, proteção volumétrica e configuração do Supabase Auth.

## 6. Riscos residuais e decisões humanas

- **Alto:** `001_initializing.sql` apaga tabelas e `auth.users`. Não executar em projeto compartilhado. Decidir se o baseline deve ser movido para bootstrap fora da cadeia de produção.
- **Médio:** qualquer booster aprovado pode revelar qualquer conta Duo ativa. O schema não relaciona conta a pedido/booster; restringir exige decisão de negócio e nova associação.
- **Médio:** reembolso/chargeback após conclusão não reverte automaticamente payout e estatísticas do booster. Regra financeira precisa ser definida antes de automatizar.
- **Médio:** Discord webhooks usam segredo estático sem timestamp assinado; rate limit reduz abuso, mas infraestrutura emissora deve adotar HMAC/timestamp quando suportado.
- **Médio:** validar constraints `NOT VALID` após saneamento dos dados existentes.
- **Baixo:** CSP ainda permite inline styles por componentes existentes.
- **Baixo:** Recharts 2.x está depreciado; migração para v3 é major e requer adaptação/testes visuais.

## 7. Credenciais e produção

Nenhum arquivo de ambiente real está versionado e nenhum valor foi incluído no diff. Não foi identificada credencial versionada que exija rotação. Antes do deploy, confirmar/rotacionar periodicamente service role, Mercado Pago, Discord bot/webhook e Vault `credential_key`; configurar secrets na plataforma, nunca em `VITE_*`.

Configurar manualmente: rate limits/IP forwarding do Supabase Auth, URLs OAuth allowlisted, `ALLOWED_ORIGINS`, WAF/CDN, limites de conexão, backups/PITR, alertas de webhook/429/5xx e execução agendada de expiração PIX.

## 8. Testes executados

- `npm test`: 76 testes aprovados, incluindo 13 novos casos monetários e de hardening HTTP/RLS.
- `npm run lint`: aprovado, zero warnings.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado.
- `npm ls --depth=0`: árvore consistente.
- Auditoria durante `npm uninstall`: 364 pacotes, 0 vulnerabilidades reportadas.
- Transpilação sintática TypeScript de todas as Edge Functions: sem diagnósticos.

`npm audit` direto não acessou o endpoint do registry no sandbox. Supabase/PostgreSQL local não foi iniciado porque o daemon Docker não estava disponível; por isso a migration requer aplicação e `supabase db lint --local` em CI/local com Docker antes de produção.

## 9. Resultado

Frontend, testes, tipos e build estão consistentes. As correções de banco são forward-only e não foram aplicadas remotamente. O sistema fica substancialmente mais restrito e determinístico, mas produção depende das ações manuais e decisões residuais acima.
