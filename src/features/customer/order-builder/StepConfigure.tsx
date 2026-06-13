import { useEffect } from 'react'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { FormField } from '@/components/ui/FormField'
import { cn, RANK_TIER_LABEL, RANK_TIER_ORDER, formatRank } from '@/lib/utils'
import type { Division, QueueType, RankTier } from '@/types'

// ─── Price engine (mirrors HomePage configurator) ─────────────────────────────
const DIVISIONS_ORDER: Division[] = ['IV', 'III', 'II', 'I']
const NO_DIV: RankTier[] = ['master', 'grandmaster', 'challenger']

function rankValue(tier: RankTier, div: Division | null): number {
  const ti = RANK_TIER_ORDER.indexOf(tier)
  if (NO_DIV.includes(tier)) return ti * 40 + 28
  const di = DIVISIONS_ORDER.indexOf(div ?? 'IV')
  return ti * 40 + di * 8
}

function calcEloPrice(
  fTier: RankTier, fDiv: Division | null,
  tTier: RankTier, tDiv: Division | null
): { price: number; hours: number } {
  const diff = rankValue(tTier, tDiv) - rankValue(fTier, fDiv)
  if (diff <= 0) return { price: 0, hours: 0 }
  const price = Math.round((diff * 0.55 + 9.99) * 100) / 100
  const hours = Math.max(1, Math.round(diff * 0.45))
  return { price, hours }
}

const WIN_BOOST_PRICE_PER_WIN = 3.99
const COACHING_PRICE: Record<number, number> = { 1: 19.99, 2: 34.99 }
const PLACEMENT_BASE = 14.99

const SERVERS = ['NA', 'EUW', 'EUNE', 'BR', 'LAN', 'LAS', 'OCE', 'TR', 'RU', 'JP', 'KR']
const DIVISIONS: Division[] = ['I', 'II', 'III', 'IV']
const MASTER_PLUS: RankTier[] = ['master', 'grandmaster', 'challenger']

interface RankSelectProps {
  label: string
  selectedTier: RankTier | null
  selectedDivision: Division | null
  onChange: (tier: RankTier, division: Division | null) => void
}

function RankSelect({ label, selectedTier, selectedDivision, onChange }: RankSelectProps) {
  const hasDivision = selectedTier && !MASTER_PLUS.includes(selectedTier)

  return (
    <FormField label={label} required>
      <div className="space-y-2">
        {/* Tier pills */}
        <div className="flex flex-wrap gap-1.5">
          {RANK_TIER_ORDER.map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => onChange(tier, MASTER_PLUS.includes(tier) ? null : (selectedDivision ?? 'I'))}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-semibold border transition-all',
                selectedTier === tier
                  ? 'border-brand bg-brand-muted text-brand'
                  : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30 hover:text-ink'
              )}
            >
              {RANK_TIER_LABEL[tier]}
            </button>
          ))}
        </div>

        {/* Division pills (only for non-master+) */}
        {hasDivision && (
          <div className="flex gap-1.5">
            {DIVISIONS.map((div) => (
              <button
                key={div}
                type="button"
                onClick={() => onChange(selectedTier!, div)}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all',
                  selectedDivision === div
                    ? 'border-brand bg-brand text-white'
                    : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30'
                )}
              >
                {div}
              </button>
            ))}
          </div>
        )}

        {selectedTier && (
          <p className="text-xs text-brand font-medium">
            Selected: {formatRank(selectedTier, selectedDivision)}
          </p>
        )}
      </div>
    </FormField>
  )
}

export function StepConfigure() {
  const {
    serviceType, currentRank, targetRank, queueType,
    server, winsPurchased, sessionsPurchased, customerNotes,
    setCurrentRank, setTargetRank, setQueueType, setServer,
    setWinsPurchased, setSessionsPurchased, setNotes,
    setBasePrice, setEstimatedHours,
  } = useOrderBuilderStore()

  // ── Recalculate price whenever any input changes ──────────────────────────
  useEffect(() => {
    if (serviceType === 'elo_boost' || serviceType === 'placement_matches') {
      if (!currentRank) return
      if (serviceType === 'elo_boost' && !targetRank) return
      const { price, hours } = serviceType === 'elo_boost'
        ? calcEloPrice(currentRank.tier, currentRank.division ?? null, targetRank!.tier, targetRank!.division ?? null)
        : { price: PLACEMENT_BASE, hours: 3 }
      setBasePrice(price)
      setEstimatedHours(hours || null)
    } else if (serviceType === 'win_boost') {
      if (!winsPurchased) return
      setBasePrice(Math.round(winsPurchased * WIN_BOOST_PRICE_PER_WIN * 100) / 100)
      setEstimatedHours(Math.max(1, Math.round(winsPurchased * 0.4)))
    } else if (serviceType === 'coaching') {
      if (!sessionsPurchased) return
      setBasePrice(COACHING_PRICE[sessionsPurchased] ?? 19.99)
      setEstimatedHours(sessionsPurchased)
    }
  }, [serviceType, currentRank, targetRank, winsPurchased, sessionsPurchased, setBasePrice, setEstimatedHours])

  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">Configure Order</h2>
      <p className="text-sm text-ink-secondary mb-6">Set your rank details and preferences.</p>

      <div className="space-y-6">
        {/* Server */}
        <FormField label="Server / Region" required>
          <div className="flex flex-wrap gap-1.5">
            {SERVERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setServer(s)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                  server === s
                    ? 'border-brand bg-brand-muted text-brand'
                    : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30 hover:text-ink'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </FormField>

        {/* Queue type (for elo/win boost) */}
        {(serviceType === 'elo_boost' || serviceType === 'win_boost') && (
          <FormField label="Queue Type" required>
            <div className="flex gap-3">
              {([['solo_duo', 'Solo/Duo'], ['flex', 'Flex Queue']] as [QueueType, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setQueueType(value)}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all',
                    queueType === value
                      ? 'border-brand bg-brand-muted text-brand'
                      : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </FormField>
        )}

        {/* Rank selectors */}
        {(serviceType === 'elo_boost' || serviceType === 'placement_matches') && (
          <>
            <RankSelect
              label="Current Rank"
              selectedTier={currentRank?.tier ?? null}
              selectedDivision={currentRank?.division ?? null}
              onChange={(tier, division) => setCurrentRank({ tier, division })}
            />
            <RankSelect
              label="Target Rank"
              selectedTier={targetRank?.tier ?? null}
              selectedDivision={targetRank?.division ?? null}
              onChange={(tier, division) => setTargetRank({ tier, division })}
            />
          </>
        )}

        {/* Wins for win boost */}
        {serviceType === 'win_boost' && (
          <FormField label="Number of Wins" required>
            <div className="flex flex-wrap gap-2">
              {[3, 5, 10, 15, 20, 30, 50].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setWinsPurchased(n)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all',
                    winsPurchased === n
                      ? 'border-brand bg-brand-muted text-brand'
                      : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30'
                  )}
                >
                  {n} wins
                </button>
              ))}
            </div>
          </FormField>
        )}

        {/* Sessions for coaching */}
        {serviceType === 'coaching' && (
          <FormField label="Session Duration" required>
            <div className="flex gap-3">
              {[['1h', 1], ['2h', 2]].map(([label, val]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => setSessionsPurchased(val as number)}
                  className={cn(
                    'flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all',
                    sessionsPurchased === (val as number)
                      ? 'border-brand bg-brand-muted text-brand'
                      : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30'
                  )}
                >
                  {label as string}
                </button>
              ))}
            </div>
          </FormField>
        )}

        {/* Notes */}
        <FormField label="Notes for Booster" hint="Optional: champion preferences, play schedule, special requests.">
          <textarea
            value={customerNotes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Only play Jinx ADC, please play during morning hours..."
            className="input-base min-h-[80px] resize-none"
            maxLength={500}
          />
        </FormField>
      </div>
    </div>
  )
}
