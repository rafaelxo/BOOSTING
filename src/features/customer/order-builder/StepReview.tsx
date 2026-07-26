import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { formatEstimatedDelivery, formatRank } from '@/lib/utils'
import { isMasterPlusCurrentTier } from '@/lib/boostDomain'
import { CLASH_TIER_LABEL, CLASH_TIER_RANGE_LABEL, CLASH_DAY_LABEL } from '@/lib/clashDomain'
import { RankBadge } from '@/components/ui'
import { Shuffle, Users, Hash, Clock, ChevronRight } from 'lucide-react'
import { GuaranteeNotice } from './GuaranteeNotice'

export function StepReview() {
  const {
    serviceType, currentRank, targetRank, queueType, boostMode,
    isMd5, riotId,
    currentLp, currentPdl,
    estimatedHours, customerNotes,
    setNotes, selectedCoachPackage, sessionsPurchased,
    clashTier, clashDay,
  } = useOrderBuilderStore()

  const currentIsMasterPlus = currentRank ? isMasterPlusCurrentTier(currentRank.tier) : false

  const isBoostFlow = serviceType === 'elo_boost' || serviceType === 'win_boost' || serviceType === 'md5'
  const modoLabel = serviceType === 'elo_boost'
    ? (boostMode === 'duo' ? 'Duo Boost' : 'Solo Boost')
    : serviceType === 'md5'
      ? 'MD5'
      : serviceType === 'win_boost'
        ? 'Vitórias'
        : ''

  // Mesmos campos exibidos no "Detalhes do Pedido" de um pedido em
  // andamento (OrderDetail.tsx) -- ícone acima do rótulo, valor em negrito
  // embaixo -- só que restrito ao que já existe antes do pedido nascer:
  // sem preço, sem booster, sem contagem de partidas jogadas.
  const detailStats = [
    ...(isBoostFlow ? [{ icon: Shuffle, label: 'Modo', value: modoLabel }] : []),
    ...(isBoostFlow ? [{ icon: Users, label: 'Fila', value: queueType === 'solo_duo' ? 'Solo/Duo' : 'Flex' }] : []),
    ...(isBoostFlow && riotId.trim() ? [{ icon: Hash, label: 'Riot ID', value: riotId.trim() }] : []),
    ...(estimatedHours ? [{ icon: Clock, label: 'Entrega Estimada', value: formatEstimatedDelivery(estimatedHours) }] : []),
  ]

  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">Revisar Pedido</h2>
      <p className="text-sm text-ink-secondary mb-7">
        Confirme se tudo está correto antes do pagamento.
      </p>

      <div className="space-y-7">
        {/* Order details */}
        <div>
          <p className="section-label mb-3">Detalhes do Pedido</p>
          <div className="card p-4">
            {serviceType === 'coaching' && selectedCoachPackage && (
              <div className="space-y-2">
                <p className="text-base font-bold text-ink">{selectedCoachPackage.title}</p>
                {selectedCoachPackage.description && (
                  <p className="text-sm text-ink-secondary leading-relaxed">{selectedCoachPackage.description}</p>
                )}
                <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-xs text-ink-muted">
                  {selectedCoachPackage.tempo && <span>Duração: <span className="font-semibold text-ink">{selectedCoachPackage.tempo}</span></span>}
                  {sessionsPurchased && <span>Sessões: <span className="font-semibold text-ink">{sessionsPurchased}</span></span>}
                </div>
              </div>
            )}

            {serviceType === 'clash' && clashTier && (
              <div className="space-y-2 pb-4 mb-4 border-b border-border-subtle">
                <p className="text-base font-bold text-ink">{boostMode === 'duo' ? 'Duo Clash' : 'Solo Clash'}</p>
                <p className="text-sm text-ink-secondary leading-relaxed">
                  {boostMode === 'duo'
                    ? 'Você joga junto com o booster — ele monta o restante do time.'
                    : 'O booster entra na sua conta e monta o time dentro do jogo.'}
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-xs text-ink-muted">
                  <span>{CLASH_TIER_LABEL[clashTier]}: <span className="font-semibold text-ink">{CLASH_TIER_RANGE_LABEL[clashTier]}</span></span>
                  {clashDay && <span>Dia: <span className="font-semibold text-ink">{CLASH_DAY_LABEL[clashDay]}</span></span>}
                </div>
              </div>
            )}

            {currentRank && (
              <div className="mb-4 pb-5 border-b border-border-subtle">
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <RankBadge tier={currentRank.tier} division={currentRank.division} size="lg" showLabel={false} />
                    <div className="min-w-0">
                      <p className="text-[11px] text-ink-muted uppercase tracking-wide">Rank Atual</p>
                      <p className="text-base font-bold text-ink truncate">{formatRank(currentRank.tier, currentRank.division)}</p>
                    </div>
                  </div>

                  {serviceType === 'elo_boost' && targetRank && (
                    <>
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <ChevronRight className="h-5 w-5 text-ink-muted" />
                        <span className="text-sm font-bold text-brand whitespace-nowrap">
                          {currentIsMasterPlus ? `${currentPdl} PDL` : `${currentLp} LP`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 min-w-0">
                        <RankBadge tier={targetRank.tier} division={targetRank.division} size="lg" showLabel={false} />
                        <div className="min-w-0">
                          <p className="text-[11px] text-ink-muted uppercase tracking-wide">Rank Alvo</p>
                          <p className="text-base font-bold text-ink truncate">{formatRank(targetRank.tier, targetRank.division)}</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {detailStats.length > 0 && (
              <div className="flex justify-center">
                <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-center">
                  {detailStats.map(({ icon: Icon, label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-ink-muted flex items-center justify-center gap-1"><Icon className="h-3 w-3 shrink-0" />{label}</p>
                      <p className="text-sm font-semibold text-ink mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {(serviceType === 'win_boost' || serviceType === 'md5') && (
          <GuaranteeNotice title={isMd5 ? 'Garantia de Win Rate MD5' : 'Garantia de Win Rate - Vitórias Extras'}>
            {isMd5
              ? 'Asseguramos uma taxa de vitória de 80% ou mais nas suas partidas classificatórias. Caso o desempenho final fique abaixo desse percentual, adicionamos vitórias extras como compensação até atingir o resultado acordado.'
              : 'Trabalhamos com o sistema de vitórias líquidas, considerando o saldo entre vitórias e derrotas. Se houver alguma derrota durante o serviço, ela será compensada com uma vitória adicional, garantindo que você receba exatamente a quantidade de vitórias contratada. Exemplo: você compra 2 vitórias. Se o resultado for 3 vitórias e 1 derrota, o saldo final será de +2 vitórias líquidas, exatamente como contratado.'}
          </GuaranteeNotice>
        )}

        {/* Notes — editable before payment */}
        <div>
          <p className="section-label mb-3">Observações para o Booster <span className="font-normal normal-case text-ink-muted">(opcional)</span></p>
          <textarea
            value={customerNotes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ex: Só jogar com Jinx ADC, preferência pela manhã, lane específica..."
            className="input-base w-full min-h-[96px] resize-none"
            maxLength={500}
          />
          {customerNotes.length > 400 && (
            <p className="text-[10px] text-ink-muted mt-1 text-right">{customerNotes.length}/500</p>
          )}
        </div>

        <p className="text-xs text-ink-muted text-center">
          Pagamento processado pelo Mercado Pago. Seus dados nunca tocam nossos servidores.
        </p>
      </div>
    </div>
  )
}
