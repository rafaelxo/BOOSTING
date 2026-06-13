import { useOrderBuilderStore, type OrderBuilderStep } from '@/stores/orderBuilderStore'
import { Stepper, Button, Card } from '@/components/ui'
import { useCurrency } from '@/hooks/useCurrency'
import { ChevronRight, ChevronLeft, Shield, Clock, Star } from 'lucide-react'

// Step components
import { StepGame } from '../order-builder/StepGame'
import { StepService } from '../order-builder/StepService'
import { StepConfigure } from '../order-builder/StepConfigure'
import { StepExtras } from '../order-builder/StepExtras'
import { StepReview } from '../order-builder/StepReview'
import { StepPayment } from '../order-builder/StepPayment'

const STEPS: { id: OrderBuilderStep; label: string }[] = [
  { id: 'game', label: 'Game' },
  { id: 'service', label: 'Service' },
  { id: 'configure', label: 'Configure' },
  { id: 'extras', label: 'Extras' },
  { id: 'review', label: 'Review' },
  { id: 'payment', label: 'Payment' },
]

const STEP_COMPONENTS: Record<OrderBuilderStep, React.ComponentType> = {
  game: StepGame,
  service: StepService,
  configure: StepConfigure,
  extras: StepExtras,
  review: StepReview,
  payment: StepPayment,
}

export function OrderBuilderPage() {
  const { step, steps, nextStep, prevStep, basePrice, extrasPrice, estimatedHours, selectedExtras, gameSlug, serviceType } = useOrderBuilderStore()
  const currency = useCurrency()

  const currentIdx = steps.indexOf(step)
  const completedSteps = steps.slice(0, currentIdx)
  const StepContent = STEP_COMPONENTS[step]
  const totalPrice = basePrice + extrasPrice
  const canGoBack = currentIdx > 0 && step !== 'payment'

  return (
    <div className="max-w-6xl mx-auto">
      {/* Stepper */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink mb-1">New Order</h1>
        <p className="text-sm text-ink-secondary mb-6">Configure your boost and extras below.</p>
        <Stepper
          steps={STEPS}
          currentStep={step}
          completedSteps={completedSteps}
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main step content */}
        <div className="flex-1 min-w-0">
          <Card padding="lg" className="animate-fade-in">
            <StepContent />

            {/* Navigation */}
            {step !== 'payment' && step !== 'review' && (
              <div className="flex items-center justify-between mt-8 pt-5 border-t border-bg-elevated">
                <Button
                  variant="ghost"
                  onClick={prevStep}
                  disabled={!canGoBack}
                  leftIcon={<ChevronLeft className="h-4 w-4" />}
                >
                  Back
                </Button>
                <Button
                  onClick={nextStep}
                  disabled={!isStepComplete(step, { gameSlug, serviceType })}
                  rightIcon={<ChevronRight className="h-4 w-4" />}
                >
                  Continue
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Summary panel */}
        <aside className="lg:w-72 shrink-0 space-y-4">
          <Card padding="md" className="sticky top-6">
            <h3 className="text-sm font-semibold text-ink mb-4">Order Summary</h3>

            {gameSlug || serviceType ? (
              <div className="space-y-3 mb-4">
                {gameSlug && (
                  <SummaryRow label="Game" value={gameSlug === 'lol' ? 'League of Legends' : gameSlug.toUpperCase()} />
                )}
                {serviceType && (
                  <SummaryRow label="Service" value={serviceType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
                )}
                {estimatedHours && (
                  <SummaryRow label="Est. delivery" value={`~${estimatedHours}h`} />
                )}
                {selectedExtras.length > 0 && (
                  <div>
                    <p className="text-xs text-ink-muted mb-1.5">Add-ons</p>
                    <div className="space-y-1">
                      {selectedExtras.map(({ extra }) => (
                        <div key={extra.id} className="flex justify-between text-xs">
                          <span className="text-ink-secondary">{extra.name}</span>
                          <span className="text-ink font-medium">
                            {extra.price_modifier > 0 ? `+${currency(extra.price_modifier)}` :
                             extra.price_modifier_pct > 0 ? `+${extra.price_modifier_pct}%` : 'Free'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-ink-muted mb-4">Configure your order to see pricing.</p>
            )}

            <div className="border-t border-bg-elevated pt-3 space-y-1.5">
              {extrasPrice > 0 && (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-secondary">Base price</span>
                    <span className="text-ink">{currency(basePrice)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-secondary">Add-ons</span>
                    <span className="text-ink">+{currency(extrasPrice)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between pt-1">
                <span className="text-sm font-semibold text-ink">Total</span>
                <span className="text-base font-bold text-brand">{currency(totalPrice)}</span>
              </div>
            </div>
          </Card>

          {/* Trust badges */}
          <Card padding="md" variant="brand">
            <div className="space-y-3">
              {[
                { icon: Shield, text: 'VPN & offline protection' },
                { icon: Star, text: '100% completion guarantee' },
                { icon: Clock, text: 'Starts within 30 minutes' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-xs text-ink-secondary">
                  <Icon className="h-3.5 w-3.5 text-brand shrink-0" />
                  {text}
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink font-medium">{value}</span>
    </div>
  )
}

function isStepComplete(step: OrderBuilderStep, state: { gameSlug: string | null; serviceType: string | null }) {
  if (step === 'game') return !!state.gameSlug
  if (step === 'service') return !!state.serviceType
  return true
}
