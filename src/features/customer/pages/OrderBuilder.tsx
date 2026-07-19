import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useOrderBuilderStore, type OrderBuilderStep } from '@/stores/orderBuilderStore'
import { Stepper, Button, Card } from '@/components/ui'
import { useCurrency } from '@/hooks/useCurrency'
import { useBoostAddons, EMPTY_ADDONS } from '@/hooks/useBoostAddons'
import { getBoostFlow } from '@/lib/boostDomain'
import { ChevronRight, ChevronLeft, Shield, Clock, Star, UserCheck } from 'lucide-react'
import type { ServiceType, Rank } from '@/types'
import { getServiceLabel, formatEstimatedDelivery } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { getCustomerOrderState } from '@/api/orders'

const VALID_SERVICES: ServiceType[] = ['elo_boost', 'win_boost', 'coaching']

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

// Riot ID no formato Nome#TAG (3-16 chars antes do #, 2-5 alfanuméricos
// depois) — mesmo formato aceito pelo lookup da Riot em StepConfigure.tsx.
function isValidRiotId(riotId: string): boolean {
  return /^.{3,16}#[A-Za-z0-9]{2,5}$/.test(riotId.trim())
}

// Regras de "step completo" usadas só para gatear o botão Continuar — a
// validação que realmente importa (preço, elegibilidade, etc.) continua
// sendo feita no backend ao criar o pedido. Isto é só UX: evita avançar
// com campos obviamente faltando/inválidos ou enquanto uma consulta Riot
// ainda está em andamento.
function isStepComplete(
  step: OrderBuilderStep,
  state: {
    serviceType: ServiceType | null
    selectedCoachPackage: { id: string } | null
    currentRank: Rank | null
    targetRank: Rank | null
    winsPurchased: number | null
    riotId: string
    isMd5: boolean
    riotVerified: boolean
    riotLookupLoading: boolean
    md5MatchesRemaining: number | null
  },
): boolean {
  if (state.riotLookupLoading) return false
  if (step === 'service') return !!state.serviceType
  if (step === 'configure') {
    // Eloboost e Vitórias/MD5 só avançam depois de uma verificação de conta
    // bem-sucedida na fila atual (mesma trava que esconde os campos).
    if (state.serviceType === 'elo_boost') {
      return state.riotVerified && !!state.currentRank && !!state.targetRank && isValidRiotId(state.riotId)
    }
    if (state.serviceType === 'win_boost' || state.serviceType === 'md5') {
      const winsOk = !!state.winsPurchased
        && state.winsPurchased >= 1
        && state.winsPurchased <= 5
        && (!state.isMd5 || state.md5MatchesRemaining == null || state.winsPurchased <= state.md5MatchesRemaining)
      return state.riotVerified && !!state.currentRank && winsOk && isValidRiotId(state.riotId)
    }
    if (state.serviceType === 'placement_matches') return !!state.currentRank
    if (state.serviceType === 'coaching') return !!state.selectedCoachPackage
  }
  return true
}

export function OrderBuilderPage() {
  const { profile } = useAuthStore()
  const {
    step, steps, nextStep, prevStep, basePrice, extrasPrice, estimatedHours,
    selectedExtraIds, currentRank, targetRank, boostMode, gameSlug, gameId, serviceType, serviceId,
    setGame, setService, setServiceId, setStep, reset, preferredBoosterName, setPreferredBooster,
    setSelectedCoachPackage, setBasePrice,
    winsPurchased, riotId, isMd5, md5MatchesRemaining, riotLookupLoading, riotVerified,
    selectedCoachPackage, setStepAttempted,
  } = useOrderBuilderStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const currency = useCurrency()
  const pendingOrderId = searchParams.get('order')
  const explicitlyStartingNewOrder = searchParams.get('new') === '1'
  const serviceParam = searchParams.get('service')
  const boosterParam = searchParams.get('booster')
  const coachPackageParam = searchParams.get('coach_package')
  const hasCatalogEntryIntent = Boolean(serviceParam || boosterParam || coachPackageParam)

  // A cobrança é persistida no banco antes de o QR ser exibido. Ao voltar
  // para /orders/new (inclusive depois de reload/fechar o navegador), procure
  // o pedido pendente mais recente e restaure diretamente a etapa de PIX.
  // `?new=1` é a escolha explícita do usuário de configurar outro pedido; o
  // anterior continua intacto e pagável em "Meus pedidos".
  const { data: resumableOrder } = useQuery({
    queryKey: ['resumable-customer-order', profile?.id],
    queryFn: async () => {
      const state = await getCustomerOrderState()
      return state.order_id ? { id: state.order_id } : null
    },
    enabled: !!profile?.id && !pendingOrderId && !explicitlyStartingNewOrder && !hasCatalogEntryIntent,
    staleTime: 0,
  })

  useEffect(() => {
    if (!resumableOrder?.id || pendingOrderId || explicitlyStartingNewOrder || hasCatalogEntryIntent) return
    setStep('payment')
    setSearchParams({ order: resumableOrder.id }, { replace: true })
  }, [
    resumableOrder?.id, pendingOrderId, explicitlyStartingNewOrder, hasCatalogEntryIntent,
    setStep, setSearchParams,
  ])

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
      const catalogServiceType = serviceType === 'md5' ? 'win_boost' : serviceType
      const { data } = await supabase.from('services').select('id').eq('game_id', gameRow!.id).eq('type', catalogServiceType!).maybeSingle()
      return data
    },
    enabled: !!gameRow?.id && !!serviceType,
    staleTime: 1000 * 60 * 30,
  })
  useEffect(() => {
    // Só sobe o uuid resolvido — NÃO reaplica setService (que resetaria
    // winsPurchased/MD5 e apagaria as partidas restantes recém-detectadas).
    if (serviceRow?.id && serviceRow.id !== serviceId) setServiceId(serviceRow.id)
  }, [serviceRow, serviceId, setServiceId])

  // `?new=1` sozinho (sem parâmetro de catálogo) só significa "descarte a
  // configuração em memória e volte pro primeiro passo" -- usado depois de um
  // PIX expirado ou ao voltar de "Meus pedidos"/detalhe do pedido. Roda uma
  // vez por chegada nessa condição; `startNewOrder()` (StepPayment.tsx) já
  // faz o reset diretamente pro clique em "Configurar novo pedido", então
  // isto cobre só quem chega aqui via navegação de fora (rota diferente).
  useEffect(() => {
    if (explicitlyStartingNewOrder && !hasCatalogEntryIntent) {
      reset()
      setStep('service')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Processa um link de entrada de catálogo (?service=/?booster=/?coach_package=)
  // -- reage a MUDANÇAS nesses parâmetros, não só ao mount. Antes rodava com
  // deps: [] (uma vez só), então navegar para outro link de catálogo (ex.:
  // trocar de serviço, ou escolher outro booster) enquanto esta página já
  // estava montada (React Router não remonta a rota só porque a query string
  // mudou) deixava a configuração antiga intacta -- inclusive um pedido
  // "aguardando pagamento" anterior continuava aparecendo na etapa de
  // pagamento com o QR/valor do pedido errado. Guard via ref evita reprocessar
  // o mesmo parâmetro assim que ele é consumido/limpo abaixo.
  const processedCatalogIntentRef = useRef<string | null>(null)
  useEffect(() => {
    const service = serviceParam as ServiceType | null
    const boosterId = boosterParam
    const coachPackageId = coachPackageParam
    if (!service && !boosterId && !coachPackageId) return

    const signature = `${service ?? ''}|${boosterId ?? ''}|${coachPackageId ?? ''}`
    if (processedCatalogIntentRef.current === signature) return
    processedCatalogIntentRef.current = signature

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

    // Mantém um marcador após consumir os parâmetros de entrada (e derruba um
    // eventual ?order= de um pedido pendente anterior) -- sem ele, a query de
    // retomada poderia encontrar aquele pedido antigo e tirar o usuário deste
    // novo fluxo que ele acabou de escolher.
    setSearchParams({ new: '1' }, { replace: true })
  }, [
    serviceParam, boosterParam, coachPackageParam,
    reset, setStep, setService, setPreferredBooster, setSelectedCoachPackage, setBasePrice, setSearchParams,
  ])

  const currentIdx = steps.indexOf(step)
  const completedSteps = steps.slice(0, currentIdx)
  const StepContent = STEP_COMPONENTS[step]
  const totalPrice = basePrice + extrasPrice
  const canGoBack = currentIdx > 0 && step !== 'payment'
  const stepComplete = isStepComplete(step, {
    serviceType, selectedCoachPackage, currentRank, targetRank,
    winsPurchased, riotId, isMd5, riotVerified, riotLookupLoading, md5MatchesRemaining,
  })

  return (
    <div>
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
                  onClick={() => {
                    if (!stepComplete) { setStepAttempted(true); return }
                    setStepAttempted(false)
                    nextStep()
                  }}
                  disabled={riotLookupLoading || !stepComplete}
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
                  <SummaryRow label="Entrega est." value={formatEstimatedDelivery(estimatedHours)} />
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
