import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui'
import { formatRank } from '@/lib/utils'
import type { RankTier } from '@/types'

// Illustrative pricing table. Real prices are calculated dynamically at order time.
const ELO_PRICING: { from: RankTier; to: RankTier; price: number }[] = [
  { from: 'iron', to: 'bronze', price: 9.99 },
  { from: 'bronze', to: 'silver', price: 14.99 },
  { from: 'silver', to: 'gold', price: 19.99 },
  { from: 'gold', to: 'platinum', price: 24.99 },
  { from: 'platinum', to: 'emerald', price: 34.99 },
  { from: 'emerald', to: 'diamond', price: 49.99 },
  { from: 'diamond', to: 'master', price: 89.99 },
  { from: 'master', to: 'grandmaster', price: 149.99 },
  { from: 'grandmaster', to: 'challenger', price: 249.99 },
]

const WIN_BOOST_PRICING = [
  { wins: 5, price: 12.99 },
  { wins: 10, price: 22.99 },
  { wins: 20, price: 39.99 },
  { wins: 30, price: 54.99 },
  { wins: 50, price: 84.99 },
]

const COACHING_PRICING = [
  { sessions: 1, hours: 1, price: 29.99 },
  { sessions: 1, hours: 2, price: 49.99 },
  { sessions: 3, hours: 1, price: 79.99 },
  { sessions: 5, hours: 1, price: 119.99 },
]

const EXTRAS = [
  { name: 'Priority Processing', price: '+15%', desc: 'Instant assignment to top-rated booster' },
  { name: 'Solo Queue Only', price: '+10%', desc: 'No duo lobbies' },
  { name: 'Mono Champion', price: '+5%', desc: 'Specific champion every game' },
  { name: 'Live Stream', price: '+$4.99', desc: 'Private stream of your games' },
  { name: 'Live Monitoring', price: '+$2.99', desc: 'Staff-monitored order with updates' },
  { name: 'Appear Offline', price: 'Free', desc: 'Invisible on friends list' },
]

export function PricingPage() {
  return (
    <div className="py-16">
      <div className="container-app max-w-5xl space-y-16">
        <div className="text-center">
          <p className="section-label mb-3">Transparent pricing</p>
          <h1 className="text-4xl font-extrabold text-ink mb-4">Pricing</h1>
          <p className="text-ink-secondary max-w-lg mx-auto">
            Prices shown are base rates for solo queue on NA. Final price is calculated in the order builder
            based on your server, current rank, queue type, and extras.
          </p>
        </div>

        {/* Elo boost table */}
        <div>
          <h2 className="text-xl font-bold text-ink mb-4">Elo Boost — Per Division</h2>
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-bg-elevated">
                  <tr>
                    <th className="py-3 px-5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">From</th>
                    <th className="py-3 px-5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">To</th>
                    <th className="py-3 px-5 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted">Starting at</th>
                    <th className="py-3 px-5 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg-elevated">
                  {ELO_PRICING.map(({ from, to, price }) => (
                    <tr key={`${from}-${to}`} className="hover:bg-bg-elevated/40 transition-colors">
                      <td className="py-3.5 px-5 font-medium text-ink">{formatRank(from)}</td>
                      <td className="py-3.5 px-5 font-medium text-ink">{formatRank(to)}</td>
                      <td className="py-3.5 px-5 text-right text-brand font-semibold">${price}</td>
                      <td className="py-3.5 px-5 text-right">
                        <Button asChild size="xs" variant="outline">
                          <Link to={`/orders/new?service=elo_boost&from=${from}&to=${to}`}>
                            Order <ChevronRight className="h-3 w-3" />
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
          <h2 className="text-xl font-bold text-ink mb-4">Win Boost</h2>
          <div className="grid sm:grid-cols-3 md:grid-cols-5 gap-3">
            {WIN_BOOST_PRICING.map(({ wins, price }) => (
              <div key={wins} className="card p-5 text-center">
                <p className="text-2xl font-bold text-ink">{wins}</p>
                <p className="text-xs text-ink-secondary mb-3">wins</p>
                <p className="text-lg font-bold text-brand mb-3">${price}</p>
                <Button asChild size="xs" className="w-full">
                  <Link to={`/orders/new?service=win_boost&wins=${wins}`}>Order</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Coaching */}
        <div>
          <h2 className="text-xl font-bold text-ink mb-4">Coaching</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
            {COACHING_PRICING.map(({ sessions, hours, price }) => (
              <div key={`${sessions}-${hours}`} className="card p-5 text-center">
                <p className="text-2xl font-bold text-ink">{sessions}</p>
                <p className="text-xs text-ink-secondary">{sessions === 1 ? 'session' : 'sessions'} · {hours}h each</p>
                <p className="text-lg font-bold text-brand my-3">${price}</p>
                <Button asChild size="xs" className="w-full">
                  <Link to={`/orders/new?service=coaching&sessions=${sessions}`}>Book</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Extras */}
        <div>
          <h2 className="text-xl font-bold text-ink mb-4">Premium Add-ons</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {EXTRAS.map(({ name, price, desc }) => (
              <div key={name} className="card p-4 flex items-start gap-3">
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
        </div>

        {/* CTA */}
        <div className="text-center">
          <Button asChild size="xl">
            <Link to="/orders/new">
              Build Your Order <ChevronRight className="h-5 w-5" />
            </Link>
          </Button>
          <p className="text-xs text-ink-muted mt-3">
            Exact price shown before checkout. No hidden fees.
          </p>
        </div>
      </div>
    </div>
  )
}
