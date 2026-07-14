import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useOrderBuilderStore, type OrderBuilderStep } from '@/stores/orderBuilderStore'
import { Stepper, Button, Card } from '@/components/ui'
import { useCurrency } from '@/hooks/useCurrency'
import { useBoostAddons, EMPTY_ADDONS } from '@/hooks/useBoostAddons'
import { getBoostFlow } from '@/lib/boostDomain'
import { ChevronRight, ChevronLeft, Shield, Clock, Star, UserCheck } from 'lucide-react'
import type { ServiceType } from '@/types'
import { getServiceLabel } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const VALID_SERVICES: ServiceType[] = ['elo_boost', 'win_boost', 'coaching', 'placement_matches', 'md5']

// Step components
import { StepService } from '../order-builder/StepService'
import { StepConfigure } from '../order-builder/StepConfigure'
import { StepExtras } from '../order-builder/StepExtras'
import { StepReview } from '../order-builder/StepReview'
import { StepPayment } from '../order-builder/StepPayment'

const STEPS: { id: OrderBuilderStep; label: string }[] = [
  { id: 'service', label: 'Serviço' },
  { id: 'configure', label: 'Configurar' },
  { id: 'extras', label: 'Extras' },
  { id: 'review', label: 'Revisão' },
  { id: 'payment', label: 'Pagamento' },
]

const STEP_COMPONENTS: Record<OrderBuilderStep, React.ComponentType> = {
  service: StepService,
  configure: StepConfigure,
  extras: StepExtras,
  review: StepReview,
  payment: StepPayment,
}

export function OrderBuilderPage() {
  const {
    step, steps, nextStep, prevStep, basePrice, extrasPrice, estimatedHours,
    selectedExtraIds, currentRank, boostMode, gameSlug, gameId, serviceType,
    setGame, setService, setStep, reset, preferredBoosterName, setPreferredBooster,
    setSelectedCoachPackage, setBasePrice,
  } = useOrderBuilderStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const currency = useCurrency()

  const flow = serviceType === 'elo_boost' && currentRank
    ? getBoostFlow(currentRank.tier, boostMode)
    : serviceType === 'win_boost' || serviceType === 'md5'
      ? 'solo_standard'
      : null
  // Mesma queryKey usada em StepExtras/StepReview — já em cache.
  const { data: addonData } = useBoostAddons(flow)
  const addonCatalog = addonData ?? EMPTY_ADDONS
  const selectedAddons = addonCatalog.filter(e => selectedExtraIds.has(e.id))

  // gameSlug/serviceType no store guardam o slug/tipo (ex.: 'lol',
  // 'elo_boost') — nunca os uuids reais de games/services. StepService.tsx
  // e StepConfigure.tsx só conhecem o slug/tipo, então resolvemos os uuids
  // aqui, uma vez, antes que StepPayment precise deles pra criar o pedido
  // (create-pix-payment exige uuid real em service_id/game_id).
  const { data: gameRow } = useQuery({
    queryKey: ['catalog-game', gameSlug],
    queryFn: async () => {
      const { data } = await supabase.from('games').select('id').eq('slug', gameSlug!).maybeSingle()
      return data
    },
    enabled: !!gameSlug,
    staleTime: 1000 * 60 * 30,
  })
  useEffect(() => {
    if (gameRow?.id && gameRow.id !== gameId) setGame(gameSlug!, gameRow.id)
  }, [gameRow, gameId, gameSlug, setGame])

  const { data: serviceRow } = useQuery({
    queryKey: ['catalog-service', gameRow?.id, serviceType],
    queryFn: async () => {
      const { data } = await supabase.from('services').select('id').eq('game_id', gameRow!.id).eq('type', serviceType!).maybeSingle()
      return data
    },
    enabled: !!gameRow?.id && !!serviceType,
    staleTime: 1000 * 60 * 30,
  })
  useEffect(() => {
    if (serviceRow?.id && serviceType) setService(serviceType, serviceRow.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceRow, serviceType])

  useEffect(() => {
    const service = searchParams.get('service') as ServiceType | null
    const boosterId = searchParams.get('booster')

    if (service && VALID_SERVICES.includes(service)) {
      reset()
      setService(service, service)
      setStep('configure')
    }

    if (boosterId) {
      // Revalida no cliente pra exibir o nome (a validação que importa é a
      // server-side, ao criar o pedido) — id inválido/não aprovado é
      // simplesmente ignorado, sem erro visível.
      supabase
        .from('public_booster_profiles')
        .select('user_id, display_name')
        .eq('user_id', boosterId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.user_id && data.display_name) setPreferredBooster(data.user_id, data.display_name)
        })
    }

    const coachPackageId = searchParams.get('coach_package')
    if (coachPackageId) {
      // Mesma lógica defensiva do ?booster= — id inválido/inativo é
      // ignorado silenciosamente; a validação que importa é server-side.
      supabase
        .from('booster_services')
        .select('id, title, price, tempo, booster_id, is_active, service_type')
        .eq('id', coachPackageId)
        .eq('service_type', 'coaching')
        .eq('is_active', true)
        .maybeSingle()
        .then(async ({ data: pkg }) => {
          if (!pkg) return
          setSelectedCoachPackage({ id: pkg.id, title: pkg.title, price: pkg.price, tempo: pkg.tempo })
          setBasePrice(pkg.price)
          if (!boosterId) {
            const { data: boosterRow } = await supabase
              .from('public_booster_profiles')
              .select('user_id, display_name')
              .eq('user_id', pkg.booster_id)
              .maybeSingle()
            if (boosterRow?.user_id && boosterRow.display_name) setPreferredBooster(boosterRow.user_id, boosterRow.display_name)
          }
        })
    }

    if (service || boosterId || coachPackageId) setSearchParams({}, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentIdx = steps.indexOf(step)
  const completedSteps = steps.slice(0, currentIdx)
  const StepContent = STEP_COMPONENTS[step]
  const totalPrice = basePrice + extrasPrice
  const canGoBack = currentIdx > 0 && step !== 'payment'

  return (
    <div className="max-w-6xl mx-auto">
      {/* Stepper */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink mb-1">Novo Pedido</h1>
        <p className="text-sm text-ink-secondary mb-6">Configure seu boost e extras abaixo.</p>

        {preferredBoosterName && (
          <div className="flex items-center gap-2.5 mb-6 rounded-xl border border-brand/25 bg-brand/10 px-4 py-3 text-sm text-ink">
            <UserCheck className="h-4 w-4 text-brand shrink-0" />
            Pedido vinculado a <span className="font-semibold">{preferredBoosterName}</span> — ele(a) poderá aceitar com exclusividade por 3 horas após o pagamento.
          </div>
        )}

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
                  Voltar
                </Button>
                <Button
                  onClick={nextStep}
                  rightIcon={<ChevronRight className="h-4 w-4" />}
                >
                  Continuar
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Summary panel */}
        <aside className="lg:w-72 shrink-0 space-y-4">
          <Card padding="md" className="sticky top-6">
            <h3 className="text-sm font-semibold text-ink mb-4">Resumo do Pedido</h3>

            {gameSlug || serviceType ? (
              <div className="space-y-3 mb-4">
                {gameSlug && (
                  <SummaryRow label="Jogo" value={gameSlug === 'lol' ? 'League of Legends' : gameSlug.toUpperCase()} />
                )}
                {serviceType && (
                  <SummaryRow label="Serviço" value={getServiceLabel(serviceType)} />
                )}
                {estimatedHours && (
                  <SummaryRow label="Entrega est." value={`~${estimatedHours}h`} />
                )}
                {selectedAddons.length > 0 && (
                  <div>
                    <p className="text-xs text-ink-muted mb-1.5">Extras</p>
                    <div className="space-y-1">
                      {selectedAddons.map((extra) => (
                        <div key={extra.id} className="flex justify-between text-xs">
                          <span className="text-ink-secondary">{extra.name}</span>
                          <span className="text-ink font-medium">
                            {extra.price_modifier > 0 ? `+${currency(extra.price_modifier)}` :
                             extra.price_modifier_pct > 0 ? `+${extra.price_modifier_pct}%` : 'Grátis'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-ink-muted mb-4">Configure seu pedido para ver o preço.</p>
            )}

            <div className="border-t border-bg-elevated pt-3 space-y-1.5">
              {extrasPrice > 0 && (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-secondary">Preço base</span>
                    <span className="text-ink">{currency(basePrice)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-secondary">Extras</span>
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
                { icon: Shield, text: 'VPN & proteção offline' },
                { icon: Star, text: 'Garantia 100% de conclusão' },
                { icon: Clock, text: 'Inicia em até 30 minutos' },
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
