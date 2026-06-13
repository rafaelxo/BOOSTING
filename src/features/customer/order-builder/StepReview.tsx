import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { formatCurrency, formatRank, RANK_TIER_LABEL } from '@/lib/utils'
import { Button } from '@/components/ui'
import { Shield, Clock, Star, ChevronRight } from 'lucide-react'

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-bg-elevated last:border-0">
      <span className="text-sm text-ink-secondary">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  )
}

export function StepReview() {
  const {
    gameSlug, serviceType, currentRank, targetRank, queueType,
    server, winsPurchased, sessionsPurchased, selectedExtras,
    basePrice, extrasPrice, estimatedHours, customerNotes,
    nextStep,
  } = useOrderBuilderStore()

  const totalPrice = basePrice + extrasPrice

  const serviceName = serviceType
    ? serviceType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : '—'

  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">Review Your Order</h2>
      <p className="text-sm text-ink-secondary mb-6">
        Confirm everything looks correct before payment.
      </p>

      <div className="space-y-5">
        {/* Order details */}
        <div>
          <p className="section-label mb-2">Order Details</p>
          <div className="card p-0 px-2">
            <ReviewRow label="Game" value={gameSlug === 'lol' ? 'League of Legends' : (gameSlug?.toUpperCase() ?? '—')} />
            <ReviewRow label="Service" value={serviceName} />
            <ReviewRow label="Server" value={server} />
            <ReviewRow label="Queue" value={queueType === 'solo_duo' ? 'Solo / Duo' : 'Flex Queue'} />
            {currentRank && (
              <ReviewRow label="Current Rank" value={formatRank(currentRank.tier, currentRank.division)} />
            )}
            {targetRank && (
              <ReviewRow label="Target Rank" value={formatRank(targetRank.tier, targetRank.division)} />
            )}
            {winsPurchased && (
              <ReviewRow label="Wins Purchased" value={`${winsPurchased} wins`} />
            )}
            {sessionsPurchased && (
              <ReviewRow label="Session Duration" value={`${sessionsPurchased}h`} />
            )}
            {estimatedHours && (
              <ReviewRow label="Estimated Delivery" value={`~${estimatedHours} hours`} />
            )}
          </div>
        </div>

        {/* Extras */}
        {selectedExtras.length > 0 && (
          <div>
            <p className="section-label mb-2">Add-ons</p>
            <div className="card p-0 px-2">
              {selectedExtras.map(({ extra }) => (
                <ReviewRow
                  key={extra.id}
                  label={extra.name}
                  value={
                    extra.price_modifier > 0
                      ? `+${formatCurrency(extra.price_modifier)}`
                      : extra.price_modifier_pct > 0
                        ? `+${extra.price_modifier_pct}%`
                        : 'Free'
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {customerNotes && (
          <div>
            <p className="section-label mb-2">Notes</p>
            <div className="card p-3">
              <p className="text-sm text-ink-secondary">{customerNotes}</p>
            </div>
          </div>
        )}

        {/* Price breakdown */}
        <div>
          <p className="section-label mb-2">Pricing</p>
          <div className="card p-0 px-2">
            <ReviewRow label="Base Price" value={formatCurrency(basePrice)} />
            {extrasPrice > 0 && (
              <ReviewRow label="Add-ons" value={`+${formatCurrency(extrasPrice)}`} />
            )}
            <div className="flex items-center justify-between py-3">
              <span className="text-base font-bold text-ink">Total</span>
              <span className="text-xl font-extrabold text-brand">{formatCurrency(totalPrice)}</span>
            </div>
          </div>
        </div>

        {/* Guarantees */}
        <div className="flex flex-col sm:flex-row gap-3">
          {[
            { icon: Shield, text: 'VPN & account protection' },
            { icon: Star, text: '100% completion guarantee' },
            { icon: Clock, text: 'Starts within 30 min' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-xs text-ink-secondary">
              <Icon className="h-3.5 w-3.5 text-success shrink-0" />
              {text}
            </div>
          ))}
        </div>

        {/* Proceed CTA */}
        <Button
          onClick={nextStep}
          size="lg"
          className="w-full"
          disabled={totalPrice <= 0}
          rightIcon={<ChevronRight className="h-5 w-5" />}
        >
          Proceed to Payment — {formatCurrency(totalPrice)}
        </Button>
        {totalPrice <= 0 && (
          <p className="text-xs text-danger text-center">Configure your order to see the price.</p>
        )}

        <p className="text-xs text-ink-muted text-center">
          Payment is processed securely by Stripe. Your card data never touches our servers.
        </p>
      </div>
    </div>
  )
}
