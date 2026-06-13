import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Users } from 'lucide-react'
import { Button } from '@/components/ui'
import { RANK_TIER_LABEL, RANK_TIER_COLOR } from '@/lib/utils'
import { PLACEMENT_PRICE } from '@/lib/pricing'
import { useCurrency } from '@/hooks/useCurrency'
import type { RankTier } from '@/types'

// ── Elo Boost — preço por divisão dentro de cada tier ───────────────────────
const ELO_TIERS: { tier: RankTier; perDiv: number }[] = [
  { tier: 'iron',      perDiv: 8.50  },
  { tier: 'bronze',    perDiv: 10    },
  { tier: 'silver',    perDiv: 13.50 },
  { tier: 'gold',      perDiv: 17    },
  { tier: 'platinum',  perDiv: 24    },
  { tier: 'emerald',   perDiv: 47    },
  { tier: 'diamond',   perDiv: 75    },
]

// ── Vitória Avulsa — preço por vitória por tier ──────────────────────────────
type WinRow = { tier: RankTier; label: string }
const WIN_TIERS: WinRow[] = [
  { tier: 'iron',         label: 'R$3'      },
  { tier: 'bronze',       label: 'R$3'      },
  { tier: 'silver',       label: 'R$4'      },
  { tier: 'gold',         label: 'R$4'      },
  { tier: 'platinum',     label: 'R$7'      },
  { tier: 'emerald',      label: 'R$10'     },
  { tier: 'diamond',      label: 'R$12–17'  },
  { tier: 'master',       label: 'R$45'     },
  { tier: 'grandmaster',  label: 'R$60'     },
  { tier: 'challenger',   label: 'R$100'    },
] as { tier: RankTier; label: string }[]

// ── MD5 — tiers disponíveis ──────────────────────────────────────────────────
const MD5_TIERS: RankTier[] = ['iron','bronze','silver','gold','platinum','emerald','diamond','master']

// ── Extras ───────────────────────────────────────────────────────────────────
const EXTRAS_STATIC = [
  { key: 'duo',       name: 'Duo Boost',          desc: 'Jogue ao lado do booster em duo queue.',         price: '+52%'  },
  { key: 'priority',  name: 'Priority Processing', desc: 'Atribuição imediata ao booster top-rated.',     price: '+15%'  },
  { key: 'solo',      name: 'Solo Queue Only',     desc: 'O booster joga apenas SoloQ.',                  price: '+10%'  },
  { key: 'mono',      name: 'Mono Champion',       desc: 'Seu campeão favorito em toda partida.',         price: '+5%'   },
  { key: 'stream',    name: 'Live Stream',          desc: 'Assista o boost via link privado.',             price: '+R$4,99' },
  { key: 'monitor',   name: 'Live Monitoring',     desc: 'Atualizações periódicas da nossa equipe.',      price: '+R$2,99' },
  { key: 'offline',   name: 'Appear Offline',      desc: 'Sua conta fica offline durante o serviço.',    price: 'Grátis' },
]

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

        {/* ── Elo Boost ── */}
        <section>
          <h2 className="text-xl font-bold text-ink mb-1">Elo Boost</h2>
          <p className="text-sm text-ink-secondary mb-4">Preço por divisão dentro de cada tier. Tier completo = 4 divisões.</p>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-bg-elevated">
                <tr>
                  <th className="py-3 px-5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Tier</th>
                  <th className="py-3 px-5 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">Por divisão</th>
                  <th className="py-3 px-5 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">Tier completo (IV→I)</th>
                  <th className="py-3 px-5 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-elevated">
                {ELO_TIERS.map(({ tier, perDiv }) => (
                  <tr key={tier} className="hover:bg-bg-elevated/40 transition-colors">
                    <td className="py-3.5 px-5">
                      <span className={`font-semibold ${RANK_TIER_COLOR[tier]}`}>
                        {RANK_TIER_LABEL[tier]}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right text-brand font-semibold">{currency(perDiv)}</td>
                    <td className="py-3.5 px-5 text-right text-ink-secondary font-medium">{currency(perDiv * 4)}</td>
                    <td className="py-3.5 px-5 text-right">
                      <Button asChild size="xs" variant="outline">
                        <Link to={`/orders/new?service=elo_boost`}>
                          Pedir <ChevronRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-muted mt-2">* Diamante IV→Mestre: 4 divs × R$75 = R$300 mínimo</p>
        </section>

        {/* ── Vitória Avulsa ── */}
        <section>
          <h2 className="text-xl font-bold text-ink mb-1">Vitória Avulsa</h2>
          <p className="text-sm text-ink-secondary mb-4">Preço por vitória de acordo com o seu rank atual.</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {WIN_TIERS.map(({ tier, label }) => (
              <div key={tier} className="card p-4 text-center">
                <p className={`text-sm font-bold mb-1 ${RANK_TIER_COLOR[tier]}`}>{RANK_TIER_LABEL[tier]}</p>
                <p className="text-xl font-extrabold text-ink">{label}</p>
                <p className="text-[10px] text-ink-muted mt-0.5">por vitória</p>
              </div>
            ))}
          </div>
          <div className="mt-3 text-right">
            <Button asChild size="sm">
              <Link to="/orders/new?service=win_boost">Comprar vitórias <ChevronRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </section>

        {/* ── MD5 — 5 Placements ── */}
        <section>
          <h2 className="text-xl font-bold text-ink mb-1">MD5 — 5 Partidas de Posicionamento</h2>
          <p className="text-sm text-ink-secondary mb-4">Preço fixo por rank desejado. Inclui as 5 partidas de placement.</p>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-bg-elevated">
                <tr>
                  <th className="py-3 px-5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Rank desejado</th>
                  <th className="py-3 px-5 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">Preço</th>
                  <th className="py-3 px-5 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-elevated">
                {MD5_TIERS.map((tier) => (
                  <tr key={tier} className="hover:bg-bg-elevated/40 transition-colors">
                    <td className="py-3.5 px-5">
                      <span className={`font-semibold ${RANK_TIER_COLOR[tier]}`}>
                        {RANK_TIER_LABEL[tier]}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right text-brand font-semibold">{currency(PLACEMENT_PRICE[tier])}</td>
                    <td className="py-3.5 px-5 text-right">
                      <Button asChild size="xs" variant="outline">
                        <Link to="/orders/new?service=placement_matches">
                          Pedir <ChevronRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Duo Boost destaque ── */}
        <section>
          <div className="card-brand p-6 flex items-start gap-4">
            <div className="h-11 w-11 rounded-2xl bg-brand flex items-center justify-center shrink-0 shadow-brand">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-ink mb-1">Duo Boost</h2>
              <p className="text-sm text-ink-secondary mb-3">
                Jogue ao lado do seu booster em duo queue. Preço do elo boost normal com acréscimo por faixa:
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="px-3 py-1.5 rounded-lg bg-bg-card border border-bg-elevated font-semibold text-ink">Ferro–Esmeralda <span className="text-brand">+52%</span></span>
                <span className="px-3 py-1.5 rounded-lg bg-bg-card border border-bg-elevated font-semibold text-ink">Diamante IV→III <span className="text-brand">+52%</span></span>
                <span className="px-3 py-1.5 rounded-lg bg-bg-card border border-bg-elevated font-semibold text-ink">Diamante III→II <span className="text-brand">+54%</span></span>
                <span className="px-3 py-1.5 rounded-lg bg-bg-card border border-bg-elevated font-semibold text-ink">Diamante II→I <span className="text-brand">+60%</span></span>
              </div>
            </div>
            <Button asChild size="sm" className="shrink-0 self-center">
              <Link to="/orders/new?service=elo_boost">Configurar</Link>
            </Button>
          </div>
        </section>

        {/* ── Extras ── */}
        <section>
          <h2 className="text-xl font-bold text-ink mb-4">Extras Opcionais</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {EXTRAS_STATIC.map(({ key, name, desc, price }) => (
              <div key={key} className="card p-4 flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-ink">{name}</p>
                    <span className="text-xs font-bold text-brand">{price}</span>
                  </div>
                  <p className="text-xs text-ink-secondary">{desc}</p>
                </div>
              </div>
            ))}
          </div>
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
