import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight, PartyPopper, Tag } from 'lucide-react'
import { Button, Modal, RankBadge } from '@/components/ui'
import { RANK_TIER_LABEL, RANK_TIER_COLOR } from '@/lib/utils'
import {
  getWinBoostPrice, getMd5WinPrice, ELO_TIERS, MASTER_PLUS_TIER_PRICE_CENTS, centsToMoney, getClashBasePrice,
  DEFAULT_COUPON_CODE, DEFAULT_COUPON_DISCOUNT_PCT,
} from '@/lib/pricing'
import { CLASH_TIER_LABEL, CLASH_TIER_RANGE_LABEL, CLASH_TIER_BOUNDARY_RANKS, CLASH_DAY_LABEL } from '@/lib/clashDomain'
import { useCurrency } from '@/hooks/useCurrency'
import type { ClashDay, ClashTier, RankTier } from '@/types'

const COUPON_PROMO_SEEN_KEY = 'pricing_coupon_promo_seen'

function CouponPromoModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(COUPON_PROMO_SEEN_KEY) === 'true') return
    const timer = setTimeout(() => setOpen(true), 500)
    return () => clearTimeout(timer)
  }, [])

  function dismiss() {
    sessionStorage.setItem(COUPON_PROMO_SEEN_KEY, 'true')
    setOpen(false)
  }

  return (
    <Modal open={open} onOpenChange={(next) => { if (!next) dismiss() }} title="Cupom aplicado automaticamente" maxWidth="sm">
      <div className="text-center space-y-4">
        <div className="h-14 w-14 rounded-full bg-success/10 border border-success/25 flex items-center justify-center mx-auto">
          <PartyPopper className="h-7 w-7 text-success" />
        </div>
        <p className="text-sm text-ink-secondary leading-relaxed">
          O cupom <span className="font-bold text-ink">{DEFAULT_COUPON_CODE}</span> já está aplicado em todos os
          preços de <span className="font-semibold text-ink">Elo Boost, Vitórias, MD5 e Clash</span> — sem precisar digitar nada.
        </p>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-success/10 border border-success/25 px-4 py-1.5 text-sm font-bold text-success">
          <Tag className="h-4 w-4" /> -{DEFAULT_COUPON_DISCOUNT_PCT}% OFF
        </div>
        <Button className="w-full" onClick={dismiss}>Entendi</Button>
      </div>
    </Modal>
  )
}

const COACHING_HIGHLIGHTS = [
  'Opções de sessão de horário predefinido',
  'Aula estruturada para evolução do jogador',
  'Coach combinado com sua função principal',
  'Aula com foco em otimização da performance',
  'Plano de melhoria personalizado',
]

function CoachingPricingSection() {
  return (
    <section>
      <h2 className="text-xl font-bold text-ink mb-1">Coaching</h2>
      <p className="text-sm text-ink-secondary mb-4">
        Sessões individuais com nossos coaches — o valor de cada pacote é definido pelo coach escolhido.
      </p>

      <div className="card p-5">
        <div className="flex flex-col gap-2.5">
          {COACHING_HIGHLIGHTS.map(item => (
            <span key={item} className="flex items-center gap-2 text-sm text-ink-secondary">
              <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />{item}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

const ELO_MASTER_PLUS_TIERS: Array<'master' | 'grandmaster'> = ['master', 'grandmaster']

const WIN_TIERS: RankTier[] = [
  'iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger',
]

const MD5_TIERS: RankTier[] = ['iron','bronze','silver','gold','platinum','emerald','diamond','master','grandmaster','challenger']

const CLASH_TIERS: ClashTier[] = ['tier_4', 'tier_3', 'tier_2', 'tier_1']
const CLASH_DAYS: ClashDay[] = ['saturday', 'sunday']

function ClashPricingSection({ currency }: { currency: (n: number) => string }) {
  return (
    <section>
      <h2 className="text-xl font-bold text-ink mb-1">Clash</h2>
      <p className="text-sm text-ink-secondary mb-4">
        Preço fixo por tier — Solo Clash o booster joga na sua conta, Duo Clash você joga junto. Agendado sempre para {CLASH_DAYS.map(d => CLASH_DAY_LABEL[d]).join(' ou ')}.
      </p>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-bg-elevated">
            <tr>
              <th className="py-3 px-5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Tier</th>
              <th className="py-3 px-5 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">Solo Clash</th>
              <th className="py-3 px-5 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">Duo Clash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-elevated">
            {CLASH_TIERS.map((tier) => {
              const { low, high } = CLASH_TIER_BOUNDARY_RANKS[tier]
              const soloPrice = getClashBasePrice('solo', tier)
              const duoPrice = getClashBasePrice('duo', tier)
              const duoIncreasePct = Math.round(((duoPrice - soloPrice) / soloPrice) * 100)
              return (
                <tr key={tier} className="hover:bg-bg-elevated/40 transition-colors">
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center shrink-0">
                        <RankBadge tier={low} size="xs" showDivision={false} showLabel={false} />
                        {high !== low && <RankBadge tier={high} size="xs" showDivision={false} showLabel={false} className="-ml-2" />}
                      </div>
                      <div>
                        <p className="font-semibold text-ink">{CLASH_TIER_LABEL[tier]}</p>
                        <p className="text-xs text-ink-muted">{CLASH_TIER_RANGE_LABEL[tier]}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-5 text-right text-ink font-semibold">{currency(soloPrice)}</td>
                  <td className="py-3.5 px-5 text-right">
                    <span className="text-ink font-semibold">{currency(duoPrice)}</span>
                    <span className="block text-[10px] text-brand font-normal">+{duoIncreasePct}%</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted mt-2">O booster é responsável por organizar e montar o time necessário para a participação no Clash.</p>
    </section>
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
            Até Diamante, o preço é por divisão. Mestre e Grão-mestre pelo tiers completos, sem Duo.
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
                      <td className="py-3.5 px-5 text-right text-ink font-semibold">{currency(perDiv)}</td>
                      <td className="py-3.5 px-5 text-right text-ink font-semibold">{currency(duoDiv)}</td>
                      <td className="py-3.5 px-5 text-right text-ink font-medium">{currency(perDiv * 4)}</td>
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
                    <td className="py-3.5 px-5 text-right text-ink font-semibold">
                      {currency(centsToMoney(MASTER_PLUS_TIER_PRICE_CENTS[tier]))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-muted mt-2">Abaixo de Mestre: média menor que 20 LP/partida aplica +15%; entre 20 e 25 mantém o preço; acima de 25 aplica -5%.</p>
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
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {MD5_TIERS.map((tier) => (
                <div key={tier} className="card p-4 text-center flex flex-col items-center gap-1.5">
                  <RankBadge tier={tier} size="xs" showDivision={false} showLabel={false} />
                  <p className={`text-sm font-bold ${RANK_TIER_COLOR[tier]}`}>{RANK_TIER_LABEL[tier]}</p>
                  <p className="text-xl font-extrabold text-ink">{currency(getMd5WinPrice('solo_duo', tier) * 5)}</p>
                  <p className="text-[10px] text-ink-muted mt-0.5">pacote MD5</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Clash ── */}
        <ClashPricingSection currency={currency} />

        {/* ── Coaching ── */}
        <CoachingPricingSection />

        {/* CTA */}
        <div className="text-center">
          <Button asChild size="xl">
            <Link to="/orders/new">
              Configurar meu pedido <ChevronRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>

      </div>

      <CouponPromoModal />
    </div>
  )
}
