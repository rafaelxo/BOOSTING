import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { formatRank, getServiceLabel, formatEstimatedDelivery } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { useBoostAddons, EMPTY_ADDONS } from '@/hooks/useBoostAddons'
import { getWinBoostPrice } from '@/lib/pricing'
import { getBoostFlow, isMasterPlusCurrentTier } from '@/lib/boostDomain'
import { Button } from '@/components/ui'
import { Shield, Clock, Star, ChevronRight, ChevronLeft } from 'lucide-react'
import { GuaranteeNotice } from './GuaranteeNotice'

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
    gameSlug, serviceType, currentRank, targetRank, queueType, boostMode,
    winsPurchased, sessionsPurchased, selectedExtraIds, winPackage,
    isMd5, md5MatchesRemaining, riotId,
    currentLp, currentPdl,
    basePrice, extrasPrice, estimatedHours, pdlModifierPct, customerNotes,
    setNotes, nextStep, prevStep,
  } = useOrderBuilderStore()

  const currentIsMasterPlus = currentRank ? isMasterPlusCurrentTier(currentRank.tier) : false
  const flow = serviceType === 'elo_boost' && currentRank
    ? getBoostFlow(currentRank.tier, boostMode)
    : serviceType === 'win_boost' || serviceType === 'md5'
      ? 'solo_standard'
      : null
  // Mesma queryKey usada em StepExtras — já em cache, não refaz a chamada.
  const { data: addonData } = useBoostAddons(flow)
  const addonCatalog = addonData ?? EMPTY_ADDONS
  const selectedAddons = addonCatalog.filter(e => selectedExtraIds.has(e.id))

  const WIN_PACKAGE_DISCOUNTS: Record<number, number> = { 1: 10, 3: 20, 5: 30 }
  const winPackagePrice = winPackage && currentRank
    ? Math.round(
        getWinBoostPrice(queueType, currentRank.tier, currentRank.division ?? null)
        * winPackage
        * (1 - (WIN_PACKAGE_DISCOUNTS[winPackage] ?? 0) / 100)
        * 100
      ) / 100
    : 0
  const currency = useCurrency()

  const totalPrice = basePrice + extrasPrice
  const serviceName = serviceType ? getServiceLabel(serviceType) : '—'
  // Preço por unidade — só faz sentido para serviços vendidos por vitória.
  const unitPrice = (serviceType === 'win_boost' || serviceType === 'md5')
    ? basePrice / (winsPurchased || 1)
    : null

  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">Revisar Pedido</h2>
      <p className="text-sm text-ink-secondary mb-6">
        Confirme se tudo está correto antes do pagamento.
      </p>

      <div className="space-y-5">
        {/* Order details */}
        <div>
          <p className="section-label mb-2">Detalhes do Pedido</p>
          <div className="card p-0 px-2">
            {gameSlug && (
              <ReviewRow label="Jogo" value={gameSlug === 'lol' ? 'League of Legends' : gameSlug.toUpperCase()} />
            )}
            <ReviewRow label="Serviço" value={serviceName} />
            {serviceType === 'elo_boost' && !currentIsMasterPlus && (
              <ReviewRow label="Modo" value={boostMode === 'duo' ? 'Duo Boost (+50%)' : 'Solo Boost'} />
            )}
            {(serviceType === 'elo_boost' || serviceType === 'win_boost' || serviceType === 'md5') && (
              <ReviewRow label="Fila" value={queueType === 'solo_duo' ? 'Solo/Duo' : 'Flex'} />
            )}
            {(serviceType === 'elo_boost' || serviceType === 'win_boost' || serviceType === 'md5') && riotId.trim() && (
              <ReviewRow label="Riot ID" value={riotId.trim()} />
            )}
            {currentRank && (
              <ReviewRow
                label={serviceType === 'placement_matches' || isMd5 ? 'Rank Final (Temporada Ant.)' : 'Rank Atual'}
                value={formatRank(currentRank.tier, currentRank.division)}
              />
            )}
            {targetRank && serviceType === 'elo_boost' && (
              <ReviewRow label="Rank Alvo" value={formatRank(targetRank.tier, targetRank.division)} />
            )}
            {serviceType === 'elo_boost' && currentRank && (
              currentIsMasterPlus ? (
                <ReviewRow label="PDL Atual" value={`${currentPdl} PDL`} />
              ) : (
                <ReviewRow label="LP Atual" value={`${currentLp} LP`} />
              )
            )}
            {winsPurchased && (
              <ReviewRow label="Quantidade de Vitórias" value={`${winsPurchased} vitórias`} />
            )}
            {isMd5 && (
              <ReviewRow label="Indicador MD5" value="Sim" />
            )}
            {isMd5 && md5MatchesRemaining != null && (
              <ReviewRow label="Partidas Restantes (Booster)" value={`${md5MatchesRemaining}`} />
            )}
            {sessionsPurchased && (
              <ReviewRow label="Sessão" value={`${sessionsPurchased}h`} />
            )}
            {estimatedHours && (
              <ReviewRow label="Entrega Estimada" value={formatEstimatedDelivery(estimatedHours)} />
            )}
          </div>
        </div>

        {/* Extras */}
        {(selectedAddons.length > 0 || winPackage) && (
          <div>
            <p className="section-label mb-2">Extras</p>
            <div className="card p-0 px-2">
              {winPackage && (
                <ReviewRow
                  label={`Pacote ${winPackage} ${winPackage === 1 ? 'vitória' : 'vitórias'} (-${WIN_PACKAGE_DISCOUNTS[winPackage]}%)`}
                  value={`+${currency(winPackagePrice)}`}
                />
              )}
              {selectedAddons.map((extra) => (
                <ReviewRow
                  key={extra.id}
                  label={extra.name}
                  value={
                    extra.price_modifier > 0
                      ? `+${currency(extra.price_modifier)}`
                      : extra.price_modifier_pct > 0
                        ? `+${extra.price_modifier_pct}%`
                        : 'Grátis'
                  }
                />
              ))}
            </div>
          </div>
        )}

        {(serviceType === 'win_boost' || serviceType === 'md5') && (
          <GuaranteeNotice title={isMd5 ? 'Garantia de Win Rate MD5' : 'Garantia de Win Rate - Vitórias Extras'}>
            {isMd5
              ? 'Asseguramos uma taxa de vitória de 80% ou mais nas suas partidas classificatórias. Caso o desempenho final fique abaixo desse percentual, adicionamos vitórias extras como compensação até atingir o resultado acordado.'
              : 'Trabalhamos com o sistema de vitórias líquidas, considerando o saldo entre vitórias e derrotas. Se houver alguma derrota durante o serviço, ela será compensada com uma vitória adicional, garantindo que você receba exatamente a quantidade de vitórias contratada. Exemplo: você compra 2 vitórias. Se o resultado for 3 vitórias e 1 derrota, o saldo final será de +2 vitórias líquidas, exatamente como contratado.'}
          </GuaranteeNotice>
        )}

        {/* Price breakdown */}
        <div>
          <p className="section-label mb-2">Preços</p>
          {serviceType === 'coaching' ? (
            <div className="card p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-secondary">Coaching por sessão</span>
                <span className="text-sm font-bold text-brand">A combinar</span>
              </div>
              <p className="text-[10px] text-ink-muted">O valor será definido com o booster após a criação do pedido.</p>
            </div>
          ) : (
            <div className="card p-0 px-2">
              {unitPrice != null && (
                <ReviewRow label="Preço Unitário" value={currency(unitPrice)} />
              )}
              <ReviewRow label="Preço Base" value={currency(basePrice)} />
              {extrasPrice > 0 && (
                <ReviewRow label="Extras" value={`+${currency(extrasPrice)}`} />
              )}
              {!!pdlModifierPct && (
                <ReviewRow
                  label="Modificador de PDL"
                  value={`${pdlModifierPct > 0 ? '+' : ''}${pdlModifierPct}%`}
                />
              )}
              <div className="flex items-center justify-between py-3">
                <span className="text-base font-bold text-ink">Total</span>
                <span className="text-xl font-extrabold text-brand">{currency(totalPrice)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Guarantees */}
        <div className="flex flex-col sm:flex-row gap-3">
          {[
            { icon: Shield, text: 'VPN & proteção da conta' },
            { icon: Star,   text: 'Garantia 100% de conclusão' },
            { icon: Clock,  text: 'Inicia em até 30 min' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-xs text-ink-secondary">
              <Icon className="h-3.5 w-3.5 text-success shrink-0" />
              {text}
            </div>
          ))}
        </div>

        {/* Notes — editable before payment */}
        <div>
          <p className="section-label mb-2">Observações para o Booster <span className="font-normal normal-case text-ink-muted">(opcional)</span></p>
          <textarea
            value={customerNotes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ex: Só jogar com Jinx ADC, preferência pela manhã, lane específica..."
            className="input-base w-full min-h-[80px] resize-none"
            maxLength={500}
          />
          {customerNotes.length > 400 && (
            <p className="text-[10px] text-ink-muted mt-1 text-right">{customerNotes.length}/500</p>
          )}
        </div>

        {/* CTA */}
        <div className="flex gap-3">
          <Button
            onClick={prevStep}
            size="lg"
            variant="secondary"
            leftIcon={<ChevronLeft className="h-5 w-5" />}
            className="shrink-0"
          >
            Voltar
          </Button>
          <Button
            onClick={nextStep}
            size="lg"
            className="flex-1"
            rightIcon={<ChevronRight className="h-5 w-5" />}
          >
            {serviceType === 'coaching' ? 'Confirmar Pedido' : `Ir para Pagamento — ${currency(totalPrice)}`}
          </Button>
        </div>

        <p className="text-xs text-ink-muted text-center">
          Pagamento processado pelo Mercado Pago. Seus dados nunca tocam nossos servidores.
        </p>
      </div>
    </div>
  )
}
