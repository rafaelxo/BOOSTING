# Instruções para agentes

## Antes de alterar

1. Rode `git status --short --branch` e preserve mudanças locais.
2. Leia `README.md`, `SECURITY_AUDIT.md`, `package.json` e migrations recentes.
3. Nunca imprima `.env.local`, service role, tokens, credenciais ou conteúdo do Vault.

## Validação

Use npm e o lockfile existente. Execute por grupo e ao final:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run audit
```

Com Docker ativo, execute também `supabase db reset` e `supabase db lint --local`. Edge Functions precisam de checagem Deno/local; não invoque Mercado Pago ou Discord reais em testes.

## Padrões sensíveis

- Preço: altere somente `shared/pricing.ts` e mantenha cálculos em centavos; toda regra precisa de teste.
- Pedidos/pagamentos: cliente nunca grava preço/order diretamente. Preserve idempotência e RPCs transacionais.
- Banco: somente migrations forward-only. Não edite migrations já aplicadas nem execute `001_initializing.sql` em banco compartilhado.
- RLS: toda tabela nova deve habilitar RLS e ter policy mínima. Views públicas devem projetar apenas colunas necessárias.
- `SECURITY DEFINER`: sempre `set search_path = public`, autenticação/autorização explícita e grants restritos.
- Edge Functions: autenticação/segredo, JSON limitado, schema estrito, timeout, erro genérico e rate limit server-side.
- Frontend: guards são UX; nunca substituem RLS. Não use `dangerouslySetInnerHTML` nem URLs não validadas.
