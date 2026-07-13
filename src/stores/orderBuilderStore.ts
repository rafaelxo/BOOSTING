import { create } from 'zustand'
import { getBoostFlow, isMasterPlusCurrentTier, type BoostFlow, type BoostMode as BoostFlowMode } from '@/lib/boostDomain'
import type { GameSlug, ServiceType, QueueType, BoostMode, Rank } from '@/types'

export type OrderBuilderStep = 'service' | 'configure' | 'extras' | 'review' | 'payment'

interface OrderBuilderState {
  step: OrderBuilderStep
  steps: OrderBuilderStep[]

  // Selections
  gameSlug: GameSlug | null
  gameId: string | null
  serviceType: ServiceType | null
  serviceId: string | null
  currentRank: Rank | null
  targetRank: Rank | null
  queueType: QueueType
  boostMode: BoostMode
  server: string
  winsPurchased: number | null
  sessionsPurchased: number | null
  customerNotes: string
  // Ids (service_extras.id) dos addons selecionados — um Set, não um array de
  // clique: a ORDEM de exibição nunca vem daqui, sempre do catálogo (que já
  // chega ordenado por sort_order). Ver shared/boostDomain.ts::sortAddonsBySortOrder.
  selectedExtraIds: Set<string>
  winPackage: number | null   // 1, 3 or 5 extra wins; null = none

  // Pedido direto: booster escolhido no perfil público (via ?booster= na URL
  // de entrada). Só exibição/roteamento — a validação real acontece no
  // servidor ao criar o pedido.
  preferredBoosterId: string | null
  preferredBoosterName: string | null

  // Riot ID (nome#tag) — usado depois pra verificar automaticamente se o
  // rank alvo foi atingido antes de concluir o pedido.
  riotId: string

  // Pacote de coach escolhido (booster_services) — preço vem sempre daqui,
  // nunca editável pelo cliente. Selecionar um pacote também vincula o
  // pedido ao booster dono dele via setPreferredBooster.
  selectedCoachPackage: { id: string; title: string; price: number; tempo: string | null } | null

  // LP (PDL) — fluxo padrão (Solo/Duo, Iron–Diamond)
  currentLp: number
  avgLpGain: number
  avgLpLoss: number

  // PDL — fluxo Master+ (rank atual Master/Grão-Mestre). Não existe PDL alvo:
  // o preço vem da tabela comercial por faixa de PDL atual + progressão.
  currentPdl: number
  avgPdlGain: number
  avgPdlLoss: number

  // Computed
  basePrice: number
  extrasPrice: number
  estimatedHours: number | null

  // Actions
  setStep: (step: OrderBuilderStep) => void
  nextStep: () => void
  prevStep: () => void
  setGame: (slug: GameSlug, id: string) => void
  setService: (type: ServiceType, id: string) => void
  setCurrentRank: (rank: Rank) => void
  setTargetRank: (rank: Rank | null) => void
  setQueueType: (queue: QueueType) => void
  setBoostMode: (mode: BoostMode) => void
  setServer: (server: string) => void
  setWinsPurchased: (wins: number) => void
  setSessionsPurchased: (sessions: number) => void
  setNotes: (notes: string) => void
  toggleExtra: (extraId: string) => void
  setWinPackage: (wins: number | null) => void
  setPreferredBooster: (id: string, name: string) => void
  setRiotId: (riotId: string) => void
  setSelectedCoachPackage: (pkg: { id: string; title: string; price: number; tempo: string | null } | null) => void
  setCurrentLp: (lp: number) => void
  setAvgLpGain: (lp: number) => void
  setAvgLpLoss: (lp: number) => void
  setCurrentPdl: (pdl: number) => void
  setAvgPdlGain: (pdl: number) => void
  setAvgPdlLoss: (pdl: number) => void
  setBasePrice: (price: number) => void
  setExtrasPrice: (price: number) => void
  setEstimatedHours: (hours: number | null) => void
  reset: () => void
}

const INITIAL_STEPS: OrderBuilderStep[] = ['service', 'configure', 'extras', 'review', 'payment']

const initialState = {
  step: 'service' as OrderBuilderStep,
  steps: INITIAL_STEPS,
  gameSlug: 'lol' as GameSlug,
  gameId: 'lol',
  serviceType: null,
  serviceId: null,
  currentRank: null,
  targetRank: null,
  queueType: 'solo_duo' as QueueType,
  boostMode: 'solo' as BoostMode,
  server: 'BR',
  winsPurchased: null,
  sessionsPurchased: null,
  customerNotes: '',
  selectedExtraIds: new Set<string>(),
  winPackage: null,
  preferredBoosterId: null,
  preferredBoosterName: null,
  riotId: '',
  selectedCoachPackage: null,
  currentLp: 0,
  avgLpGain: 20,
  avgLpLoss: 15,
  currentPdl: 0,
  avgPdlGain: 22,
  avgPdlLoss: 18,
  basePrice: 0,
  extrasPrice: 0,
  estimatedHours: null,
}

// Fluxo do configurador (solo_standard/duo_standard/master_plus) para o
// (rank atual, modalidade) combinados — null se a combinação for inválida
// (ex.: rank ainda não escolhido).
function flowFor(rank: Rank | null, mode: BoostMode): BoostFlow | null {
  if (!rank) return null
  return getBoostFlow(rank.tier, mode as BoostFlowMode)
}

export const useOrderBuilderStore = create<OrderBuilderState>((set, get) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  nextStep: () => {
    const { step, steps } = get()
    const idx = steps.indexOf(step)
    if (idx < steps.length - 1) set({ step: steps[idx + 1] })
  },

  prevStep: () => {
    const { step, steps } = get()
    const idx = steps.indexOf(step)
    if (idx > 0) set({ step: steps[idx - 1] })
  },

  setGame: (gameSlug, gameId) => set({ gameSlug, gameId }),
  setService: (serviceType, serviceId) => set({ serviceType, serviceId }),

  setCurrentRank: (currentRank) => set((state) => {
    const forcedMasterPlus = isMasterPlusCurrentTier(currentRank.tier)
    const nextMode: BoostMode = forcedMasterPlus ? 'solo' : state.boostMode
    const prevFlow = flowFor(state.currentRank, state.boostMode)
    const nextFlow = flowFor(currentRank, nextMode)
    const flowChanged = prevFlow !== nextFlow

    return {
      currentRank,
      boostMode: nextMode,
      // Rank alvo depende do rank atual (progressão válida muda) — sempre
      // limpo ao trocar o rank atual, o usuário escolhe de novo.
      targetRank: null,
      selectedExtraIds: flowChanged ? new Set<string>() : state.selectedExtraIds,
      winPackage: flowChanged ? null : state.winPackage,
      currentLp: forcedMasterPlus ? 0 : state.currentLp,
      currentPdl: forcedMasterPlus ? state.currentPdl : 0,
    }
  }),

  setTargetRank: (targetRank) => set({ targetRank }),
  setQueueType: (queueType) => set({ queueType }),

  setBoostMode: (boostMode) => set((state) => {
    // Duo nunca é aceito com rank atual Master+ — defesa em profundidade,
    // a UI não deve nem oferecer essa opção nesse caso.
    if (boostMode === 'duo' && state.currentRank && isMasterPlusCurrentTier(state.currentRank.tier)) {
      return {}
    }
    const prevFlow = flowFor(state.currentRank, state.boostMode)
    const nextFlow = flowFor(state.currentRank, boostMode)
    const flowChanged = prevFlow !== nextFlow

    return {
      boostMode,
      // Addons são exclusivos por fluxo (Solo ≠ Duo ≠ Master+) — trocar a
      // modalidade remove completamente os addons incompatíveis do estado,
      // não só da tela.
      selectedExtraIds: flowChanged ? new Set<string>() : state.selectedExtraIds,
    }
  }),

  setServer: (server) => set({ server }),
  setWinsPurchased: (winsPurchased) => set({ winsPurchased }),
  setSessionsPurchased: (sessionsPurchased) => set({ sessionsPurchased }),
  setNotes: (customerNotes) => set({ customerNotes }),

  toggleExtra: (extraId) =>
    set((state) => {
      const next = new Set(state.selectedExtraIds)
      if (next.has(extraId)) next.delete(extraId)
      else next.add(extraId)
      return { selectedExtraIds: next }
    }),

  setWinPackage: (winPackage) => set({ winPackage }),
  setPreferredBooster: (preferredBoosterId, preferredBoosterName) => set({ preferredBoosterId, preferredBoosterName }),
  setRiotId: (riotId) => set({ riotId }),
  setSelectedCoachPackage: (selectedCoachPackage) => set({ selectedCoachPackage }),

  setCurrentLp: (currentLp) => set({ currentLp }),
  setAvgLpGain: (avgLpGain) => set({ avgLpGain }),
  setAvgLpLoss: (avgLpLoss) => set({ avgLpLoss }),
  setCurrentPdl: (currentPdl) => set({ currentPdl }),
  setAvgPdlGain: (avgPdlGain) => set({ avgPdlGain }),
  setAvgPdlLoss: (avgPdlLoss) => set({ avgPdlLoss }),
  setBasePrice: (basePrice) => set({ basePrice }),
  setExtrasPrice: (extrasPrice) => set({ extrasPrice }),
  setEstimatedHours: (estimatedHours) => set({ estimatedHours }),

  reset: () => set({ ...initialState, selectedExtraIds: new Set<string>() }),
}))
