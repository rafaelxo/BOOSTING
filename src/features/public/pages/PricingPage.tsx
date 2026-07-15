import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight, MessageCircle } from 'lucide-react'
import { Button, Skeleton, RankBadge } from '@/components/ui'
import { RANK_TIER_LABEL, RANK_TIER_COLOR } from '@/lib/utils'
import { getWinBoostPrice, getMd5WinPrice, ELO_TIERS, MASTER_PLUS_TIER_PRICE_CENTS, centsToMoney } from '@/lib/pricing'
import { useCurrency } from '@/hooks/useCurrency'
import { useBoostAddons, EMPTY_ADDONS } from '@/hooks/useBoostAddons'
import type { RankTier, ServiceExtra } from '@/types'

const ELO_MASTER_PLUS_TIERS: Array<'master' | 'grandmaster' | 'challenger'> = ['master', 'grandmaster', 'challenger']

const WIN_TIERS: RankTier[] = [
  'iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger',
]

const MD5_TIERS: RankTier[] = ['iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger']

function formatExtraPrice(extra: ServiceExtra, currency: (n: number) => string): string {
  if (extra.price_modifier > 0) return `+${currency(extra.price_modifier)}`
  if (extra.price_modifier_pct > 0) return `+${extra.price_modifier_pct}%`
  return 'Grátis'
}

function AddonGroup({ title, flow, currency }: { title: string; flow: 'solo_standard' | 'duo_standard' | 'master_plus'; currency: (n: number) => string }) {
  const { data, isLoading, isError } = useBoostAddons(flow)
  const extras = data ?? EMPTY_ADDONS

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
      </div>
    )
  }

  if (isError) {
    return (
      <div>
        <h3 className="text-sm font-bold text-ink-secondary uppercase tracking-wide mb-3">{title}</h3>
        <div className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">
          Não foi possível carregar estes extras. Tente novamente em instantes.
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-ink-secondary uppercase tracking-wide mb-3">{title}</h3>
      {extras.length === 0 ? (
        <p className="rounded-2xl border border-bg-elevated px-4 py-3 text-sm text-ink-muted">
          Nenhum extra ativo nesta modalidade.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {extras.map((extra) => (
          <div key={extra.id} className="card p-4 flex items-start gap-3">
            <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-ink">{extra.name}</p>
                <span className="text-xs font-bold text-brand">{formatExtraPrice(extra, currency)}</span>
              </div>
              <p className="text-xs text-ink-secondary">{extra.description}</p>
            </div>
          </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function PricingPage() {
  const currency = useCurrency()

  return (
    <div className="py-16">
      <div className="container-app max-w-5xl space-y-16">

        {/* Header */}
        <div className="text-center">
          <p className="section-label mb-3">Preços</p>
          <h1 className="text-4xl font-extrabold text-ink mb-4">Transparência total nos preços</h1>
          <p className="text-ink-secondary max-w-lg mx-auto">
            Preços em reais, sem taxas ocultas. Configure seu pedido e veja o valor exato antes de pagar.
          </p>
        </div>

        {/* ── Solo Boost / Duo Boost ── */}
        <section>
          <h2 className="text-xl font-bold text-ink mb-1">Solo Boost / Duo Boost</h2>
          <p className="text-sm text-ink-secondary mb-4">
            Até Diamante, o preço é por divisão. Mestre, Grão-mestre e Challenger são tiers separados, sem Duo e sem tier completo.
          </p>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-bg-elevated">
                <tr>
                  <th className="py-3 px-5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Tier</th>
                  <th className="py-3 px-5 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">Solo / div</th>
                  <th className="py-3 px-5 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">Duo / div <span className="text-brand normal-case font-normal">(+50%)</span></th>
                  <th className="py-3 px-5 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">Tier completo (solo)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-elevated">
                {ELO_TIERS.map(({ tier, perDiv }) => {
                  const duoDiv = Math.round(perDiv * 1.5 * 100) / 100
                  return (
                    <tr key={tier} className="hover:bg-bg-elevated/40 transition-colors">
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          <RankBadge tier={tier} size="xs" showDivision={false} showLabel={false} />
                          <span className={`font-semibold ${RANK_TIER_COLOR[tier]}`}>
                            {RANK_TIER_LABEL[tier]}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-right text-brand font-semibold">{currency(perDiv)}</td>
                      <td className="py-3.5 px-5 text-right text-ink font-semibold">{currency(duoDiv)}</td>
                      <td className="py-3.5 px-5 text-right text-ink-secondary font-medium">{currency(perDiv * 4)}</td>
                    </tr>
                  )
                })}
                {ELO_MASTER_PLUS_TIERS.map((tier) => (
                  <tr key={tier} className="hover:bg-bg-elevated/40 transition-colors">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <RankBadge tier={tier} size="xs" showDivision={false} showLabel={false} />
                        <span className={`font-semibold ${RANK_TIER_COLOR[tier]}`}>
                          {RANK_TIER_LABEL[tier]}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-right text-ink-muted font-semibold">—</td>
                    <td className="py-3.5 px-5 text-right text-ink-muted font-semibold">—</td>
                    <td className="py-3.5 px-5 text-right text-brand font-semibold">
                      {currency(centsToMoney(MASTER_PLUS_TIER_PRICE_CENTS[tier]))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-muted mt-2">Abaixo de Mestre: média menor que 20 LP/partida aplica +20%; entre 20 e 25 mantém o preço; acima de 25 aplica -5%.</p>
        </section>

        {/* ── Coaching ── */}
        <section>
          <div className="card p-6 flex items-start gap-4">
            <div className="h-11 w-11 rounded-2xl bg-success/20 border border-success/30 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5 text-success" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-ink mb-1">Coaching</h2>
              <p className="text-sm text-ink-secondary mb-3">
                Sessões individuais com um booster Grão-mestre ou Desafiante. O valor é combinado diretamente com o booster — não há cobrança antecipada.
              </p>
              <div className="flex flex-wrap gap-3 text-sm mb-3">
                {['Análise de gameplay', 'Revisão de replays', 'Posicionamento e mapa', 'Mentalidade competitiva'].map(item => (
                  <span key={item} className="flex items-center gap-1.5 text-xs text-ink-secondary">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />{item}
                  </span>
                ))}
              </div>
              <p className="text-lg font-bold text-brand">Valor a combinar · por sessão</p>
            </div>
          </div>
        </section>

        {/* ── Vitórias / MD5 ── */}
        <section>
          <h2 className="text-xl font-bold text-ink mb-1">Vitórias / MD5</h2>
          <p className="text-sm text-ink-secondary mb-4">Preço por vitória de acordo com o seu rank atual.</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {WIN_TIERS.map((tier) => {
              const price = getWinBoostPrice('solo_duo', tier, null)
              return (
                <div key={tier} className="card p-4 text-center flex flex-col items-center gap-1.5">
                  <RankBadge tier={tier} size="xs" showDivision={false} showLabel={false} />
                  <p className={`text-sm font-bold ${RANK_TIER_COLOR[tier]}`}>{RANK_TIER_LABEL[tier]}</p>
                  <p className="text-xl font-extrabold text-ink">{currency(price)}</p>
                  <p className="text-[10px] text-ink-muted mt-0.5">por vitória</p>
                </div>
              )
            })}
          </div>

          {/* + MD5 sub-row */}
          <div className="mt-8">
            <h3 className="text-sm font-bold text-ink mb-1">+ MD5: garantia de win rate — ative automaticamente se ainda não jogou o posicionamento</h3>
            <p className="text-xs text-ink-secondary mb-3">Preço da Vitória Avulsa com 50% de desconto. Valor abaixo já é o pacote completo de 5 vitórias — menos vitórias desconta proporcionalmente.</p>
            <div className="card overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-bg-elevated">
                  <tr>
                    <th className="py-3 px-5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Rank desejado</th>
                    <th className="py-3 px-5 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">Preço</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg-elevated">
                  {MD5_TIERS.map((tier) => (
                    <tr key={tier} className="hover:bg-bg-elevated/40 transition-colors">
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          <RankBadge tier={tier} size="xs" showDivision={false} showLabel={false} />
                          <span className={`font-semibold ${RANK_TIER_COLOR[tier]}`}>
                            {RANK_TIER_LABEL[tier]}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-right text-brand font-semibold">{currency(getMd5WinPrice('solo_duo', tier) * 5)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Extras ── */}
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-ink mb-1">Extras Opcionais</h2>
            <p className="text-sm text-ink-secondary">Os extras disponíveis dependem da modalidade escolhida no configurador.</p>
          </div>
          <AddonGroup title="Solo Boost" flow="solo_standard" currency={currency} />
          <AddonGroup title="Duo Boost" flow="duo_standard" currency={currency} />
          <AddonGroup title="Boost Master+" flow="master_plus" currency={currency} />
        </section>

        {/* CTA */}
        <div className="text-center">
          <Button asChild size="xl">
            <Link to="/orders/new">
              Configurar meu pedido <ChevronRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>

      </div>
    </div>
  )
}
