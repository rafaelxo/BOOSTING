import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui'
import { formatRank } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { useTranslation } from 'react-i18next'
import type { RankTier } from '@/types'

const ELO_PRICING: { from: RankTier; to: RankTier; price: number }[] = [
  { from: 'iron',        to: 'bronze',      price: 9.99   },
  { from: 'bronze',      to: 'silver',      price: 14.99  },
  { from: 'silver',      to: 'gold',        price: 19.99  },
  { from: 'gold',        to: 'platinum',    price: 24.99  },
  { from: 'platinum',    to: 'emerald',     price: 34.99  },
  { from: 'emerald',     to: 'diamond',     price: 49.99  },
  { from: 'diamond',     to: 'master',      price: 89.99  },
  { from: 'master',      to: 'grandmaster', price: 149.99 },
  { from: 'grandmaster', to: 'challenger',  price: 249.99 },
]

const WIN_BOOST_PRICING = [
  { wins: 5,  price: 12.99 },
  { wins: 10, price: 22.99 },
  { wins: 20, price: 39.99 },
  { wins: 30, price: 54.99 },
  { wins: 50, price: 84.99 },
]

const COACHING_PRICING = [
  { sessions: 1, hours: 1, price: 29.99  },
  { sessions: 1, hours: 2, price: 49.99  },
  { sessions: 3, hours: 1, price: 79.99  },
  { sessions: 5, hours: 1, price: 119.99 },
]

export function PricingPage() {
  const { t } = useTranslation()
  const currency = useCurrency()

  const EXTRAS = [
    { key: 'priority',   nameKey: 'pricing.extras.priority',   descKey: 'pricing.extras.priorityDesc',   price: '+15%'  },
    { key: 'solo',       nameKey: 'pricing.extras.solo',       descKey: 'pricing.extras.soloDesc',       price: '+10%'  },
    { key: 'mono',       nameKey: 'pricing.extras.mono',       descKey: 'pricing.extras.monoDesc',       price: '+5%'   },
    { key: 'stream',     nameKey: 'pricing.extras.stream',     descKey: 'pricing.extras.streamDesc',     price: '+' + currency(4.99) },
    { key: 'monitoring', nameKey: 'pricing.extras.monitoring', descKey: 'pricing.extras.monitoringDesc', price: '+' + currency(2.99) },
    { key: 'offline',    nameKey: 'pricing.extras.offline',    descKey: 'pricing.extras.offlineDesc',    price: t('pricing.extras.free') },
  ]

  return (
    <div className="py-16">
      <div className="container-app max-w-5xl space-y-16">
        <div className="text-center">
          <p className="section-label mb-3">{t('pricing.sectionLabel')}</p>
          <h1 className="text-4xl font-extrabold text-ink mb-4">{t('pricing.title')}</h1>
          <p className="text-ink-secondary max-w-lg mx-auto">
            {t('pricing.subtitle')}
          </p>
        </div>

        {/* Elo boost table */}
        <div>
          <h2 className="text-xl font-bold text-ink mb-4">{t('pricing.eloBoost')}</h2>
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-bg-elevated">
                  <tr>
                    <th className="py-3 px-5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('pricing.from')}</th>
                    <th className="py-3 px-5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('pricing.to')}</th>
                    <th className="py-3 px-5 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('pricing.startingFrom')}</th>
                    <th className="py-3 px-5 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg-elevated">
                  {ELO_PRICING.map(({ from, to, price }) => (
                    <tr key={`${from}-${to}`} className="hover:bg-bg-elevated/40 transition-colors">
                      <td className="py-3.5 px-5 font-medium text-ink">{formatRank(from)}</td>
                      <td className="py-3.5 px-5 font-medium text-ink">{formatRank(to)}</td>
                      <td className="py-3.5 px-5 text-right text-brand font-semibold">{currency(price)}</td>
                      <td className="py-3.5 px-5 text-right">
                        <Button asChild size="xs" variant="outline">
                          <Link to={`/orders/new?service=elo_boost&from=${from}&to=${to}`}>
                            {t('pricing.orderNow')} <ChevronRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Win boost */}
        <div>
          <h2 className="text-xl font-bold text-ink mb-4">{t('pricing.winBoost')}</h2>
          <div className="grid sm:grid-cols-3 md:grid-cols-5 gap-3">
            {WIN_BOOST_PRICING.map(({ wins, price }) => (
              <div key={wins} className="card p-5 text-center">
                <p className="text-2xl font-bold text-ink">{wins}</p>
                <p className="text-xs text-ink-secondary mb-3">{t('pricing.winsUnit')}</p>
                <p className="text-lg font-bold text-brand mb-3">{currency(price)}</p>
                <Button asChild size="xs" className="w-full">
                  <Link to={`/orders/new?service=win_boost&wins=${wins}`}>{t('pricing.orderNow')}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Coaching */}
        <div>
          <h2 className="text-xl font-bold text-ink mb-4">{t('pricing.coaching')}</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
            {COACHING_PRICING.map(({ sessions, hours, price }) => (
              <div key={`${sessions}-${hours}`} className="card p-5 text-center">
                <p className="text-2xl font-bold text-ink">{sessions}</p>
                <p className="text-xs text-ink-secondary">{sessions === 1 ? t('pricing.sessionLabel', { hours }) : t('pricing.sessionsLabel', { count: sessions, hours })}</p>
                <p className="text-lg font-bold text-brand my-3">{currency(price)}</p>
                <Button asChild size="xs" className="w-full">
                  <Link to={`/orders/new?service=coaching&sessions=${sessions}`}>{t('pricing.configureOrder')}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Extras */}
        <div>
          <h2 className="text-xl font-bold text-ink mb-4">{t('pricing.extrasTitle')}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {EXTRAS.map(({ key, nameKey, descKey, price }) => (
              <div key={key} className="card p-4 flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-ink">{t(nameKey)}</p>
                    <span className="text-xs font-bold text-brand">{price}</span>
                  </div>
                  <p className="text-xs text-ink-secondary">{t(descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Button asChild size="xl">
            <Link to="/orders/new">
              {t('pricing.configureOrder')} <ChevronRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
