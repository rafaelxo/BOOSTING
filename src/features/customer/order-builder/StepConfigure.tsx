import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { FormField } from '@/components/ui/FormField'
import { RankBadge, RankLockGrid, WinCountButtons, PdlFieldRow } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn, RANK_TIER_LABEL, RANK_TIER_ORDER } from '@/lib/utils'
import { calcEloPrice, getWinBoostPrice, getMd5WinPrice, PLACEMENT_PRICE, DUO_BOOST_PCT, applyLpModifier } from '@/lib/pricing'
import {
  isMasterPlusCurrentTier, getValidMasterPlusTargets, getPdlBracket,
} from '@/lib/boostDomain'
import type { Division, QueueType, RankTier } from '@/types'
import { Check, Search, AlertCircle } from 'lucide-react'
import { CoachPackagePicker } from './CoachPackagePicker'

// ── Main component ────────────────────────────────────────────────────────────

export function StepConfigure() {
  const {
    serviceType, currentRank, targetRank, queueType, boostMode,
    winsPurchased,
    isMd5, md5MatchesRemaining, md5MatchesRemainingCeiling,
    currentLp, avgLpGain,
    currentPdl, avgPdlGain,
    riotId, riotAutoFilled,
    setCurrentRank, setTargetRank, setQueueType, setBoostMode,
    setWinsPurchased,
    setIsMd5, setMd5MatchesRemaining, setMd5MatchesRemainingFromApi,
    setCurrentLp, setAvgLpGain,
    setCurrentPdl, setAvgPdlGain,
    setBasePrice, setEstimatedHours, setRiotId, setRiotAutoFilled,
  } = useOrderBuilderStore()

  const currentIsMasterPlus = currentRank ? isMasterPlusCurrentTier(currentRank.tier) : false
  const pdlBracket = currentIsMasterPlus ? getPdlBracket(currentPdl) : null
  const [riotLookupLoading, setRiotLookupLoading] = useState(false)
  const [riotLookupMessage, setRiotLookupMessage] = useState<string | null>(null)
  const [riotLookupError, setRiotLookupError] = useState<string | null>(null)
  const [md5Message, setMd5Message] = useState<string | null>(null)

  async function lookupRiotRank() {
    const trimmed = riotId.trim()
    setRiotLookupMessage(null)
    setRiotLookupError(null)
    setMd5Message(null)

    setRiotLookupLoading(true)
    const { data, error } = await supabase.functions.invoke('riot-account-rank', {
      body: { riot_id: trimmed },
    })
    setRiotLookupLoading(false)

    if (error) {
      setRiotLookupError(error.message || 'Não foi possível consultar a Riot agora.')
      return
    }

    const result = data as {
      found?: boolean
      ranked?: boolean
      tier?: RankTier
      division?: Division | null
      league_points?: number
      avg_lp_gain?: number | null
      avg_lp_loss?: number | null
      message?: string
    } | null

    if (!result?.found) {
      setRiotLookupError('Conta Riot não encontrada.')
      return
    }
    if (!result.ranked || !result.tier) {
      setRiotLookupError('Conta encontrada, mas sem rank Solo/Duo atual.')
      return
    }

    setCurrentRank({ tier: result.tier, division: result.division ?? null })
    if (isMasterPlusCurrentTier(result.tier)) {
      setCurrentPdl(Math.max(0, Math.min(9999, result.league_points ?? 0)))
      if (typeof result.avg_lp_gain === 'number') setAvgPdlGain(Math.max(1, Math.min(200, result.avg_lp_gain)))
    } else {
      setCurrentLp(Math.max(0, Math.min(99, result.league_points ?? 0)))
      if (typeof result.avg_lp_gain === 'number') setAvgLpGain(Math.max(1, Math.min(50, result.avg_lp_gain)))
    }

    setRiotLookupMessage(result.message ?? 'Rank atual preenchido automaticamente. Você ainda pode alterar os dados.')
    setRiotAutoFilled(true)
  }

  async function lookupForWinBoost() {
    const trimmed = riotId.trim()
    setRiotLookupMessage(null)
    setRiotLookupError(null)
    setMd5Message(null)

    setRiotLookupLoading(true)
    const { data, error } = await supabase.functions.invoke('riot-account-rank', {
      body: { riot_id: trimmed, queue: queueType },
    })
    setRiotLookupLoading(false)

    if (error) {
      setRiotLookupError(error.message || 'Não foi possível consultar a Riot agora.')
      return
    }

    const result = data as {
      found?: boolean
      ranked?: boolean
      tier?: RankTier
      division?: Division | null
      md5_eligible?: boolean
      matches_remaining?: number
      message?: string
    } | null

    if (!result?.found) {
      setRiotLookupError('Conta Riot não encontrada.')
      return
    }

    if (result.md5_eligible) {
      // Conta ainda não rankeada nesta fila — não há "rank atual" para
      // preencher (o usuário ainda precisa escolher manualmente o rank da
      // última temporada), então a grade de rank NÃO é travada aqui.
      const remaining = result.matches_remaining ?? 5
      setIsMd5(true)
      setMd5MatchesRemainingFromApi(remaining)
      setWinsPurchased(Math.min(remaining, winsPurchased ?? remaining))
      setMd5Message(
        `Conta ainda não rankeada nesta fila - MD5 ativado automaticamente. `
        + `Faltam ${remaining} partida(s) de posicionamento.`,
      )
    } else {
      // Conta já rankeada nesta fila — a Riot retorna tier/division junto
      // com `ranked: true`/`md5_eligible: false`; preenchemos o rank atual
      // (preço de win_boost/md5 depende só de currentRank.tier — ver
      // computeOrderPrice em shared/pricing.ts — então LP/PDL não são
      // preenchidos aqui, seriam estado morto para este fluxo) e só então
      // travamos a grade.
      setMd5MatchesRemainingFromApi(0)
      setIsMd5(false)
      setRiotLookupMessage(result.message ?? 'Conta já possui rank nesta fila - MD5 indisponível.')
      if (result.tier) {
        setCurrentRank({ tier: result.tier, division: result.division ?? null })
        setRiotAutoFilled(true)
      }
    }
  }

  // Grão-Mestre só tem um destino válido (Challenger) — a interface pode
  // preenchê-lo automaticamente, mas o backend valida a combinação de novo.
  useEffect(() => {
    if (currentRank?.tier === 'grandmaster' && targetRank?.tier !== 'challenger') {
      setTargetRank({ tier: 'challenger', division: null })
    }
  }, [currentRank, targetRank, setTargetRank])

  // Preço do Master+ vem da tabela comercial (origem × destino × faixa de
  // PDL atual) — não existe fórmula local. Se a combinação ainda não tem
  // preço configurado, o preço fica indefinido e o pedido não avança.
  const { data: masterPlusPriceRow, isFetching: loadingMasterPlusPrice } = useQuery({
    queryKey: ['master-plus-price', currentRank?.tier, targetRank?.tier, pdlBracket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('master_plus_pricing')
        .select('price')
        .eq('current_tier', currentRank!.tier)
        .eq('target_tier', targetRank!.tier)
        .eq('pdl_bracket', pdlBracket!)
        .maybeSingle()
      if (error) throw error
      return data as { price: number | null } | null
    },
    enabled: currentIsMasterPlus && !!currentRank && !!targetRank && !!pdlBracket,
  })

  useEffect(() => {
    if (serviceType === 'elo_boost') {
      if (!currentRank) return

      if (currentIsMasterPlus) {
        const price = masterPlusPriceRow?.price
        if (!targetRank || price == null) {
          setBasePrice(0)
          setEstimatedHours(null)
          return
        }
        setBasePrice(price)
        setEstimatedHours(null)
        return
      }

      if (!targetRank) return
      const { price, hours } = calcEloPrice(
        queueType,
        currentRank.tier, currentRank.division ?? null,
        targetRank.tier, targetRank.division ?? null,
      )
      const withLp = applyLpModifier(price, currentRank.tier, currentLp, avgLpGain, undefined, queueType)
      const finalPrice = boostMode === 'duo'
        ? Math.round(withLp * (1 + DUO_BOOST_PCT / 100) * 100) / 100
        : withLp
      setBasePrice(finalPrice)
      setEstimatedHours(hours || null)

    } else if (serviceType === 'placement_matches') {
      if (!currentRank) return
      setBasePrice(PLACEMENT_PRICE[currentRank.tier] ?? 15)
      setEstimatedHours(3)
    } else if (serviceType === 'win_boost') {
      if (!winsPurchased || !currentRank) return
      const pricePerWin = getWinBoostPrice(queueType, currentRank.tier, currentRank.division ?? null)
      setBasePrice(Math.round(winsPurchased * pricePerWin * 100) / 100)
      setEstimatedHours(Math.max(1, Math.round(winsPurchased * 0.4)))
    } else if (serviceType === 'md5') {
      if (!winsPurchased || !currentRank) return
      const cappedWins = Math.min(5, winsPurchased)
      const pricePerWin = getMd5WinPrice(queueType, currentRank.tier)
      setBasePrice(Math.round(cappedWins * pricePerWin * 100) / 100)
      setEstimatedHours(Math.max(1, Math.round(cappedWins * 0.4)))
    }
    // coaching: preço vem do pacote escolhido em CoachPackagePicker
    // (setBasePrice chamado lá), não recalculado aqui.
  }, [
    serviceType, currentRank, targetRank, boostMode, winsPurchased, queueType,
    currentLp, avgLpGain, currentIsMasterPlus, masterPlusPriceRow,
    setBasePrice, setEstimatedHours,
  ])

  const masterPlusTargets = currentRank && currentIsMasterPlus
    ? getValidMasterPlusTargets(currentRank.tier as 'master' | 'grandmaster')
    : []

  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">Configurar Pedido</h2>
      <p className="text-sm text-ink-secondary mb-6">Defina seus ranks e preferências.</p>

      <div className="space-y-6">
        {/* Riot ID first: used to prefill current rank/LP from Riot. The user
            may still edit everything afterwards; backend validation remains
            authoritative when creating/completing orders. */}
        {serviceType === 'elo_boost' && (
          <FormField label="Riot ID" required hint="Informe antes de configurar. Ex: NomeDoInvocador#BR1. Vamos tentar preencher seu elo atual automaticamente.">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={riotId}
                onChange={e => {
                  setRiotId(e.target.value)
                  setRiotLookupMessage(null)
                  setRiotLookupError(null)
                  setMd5Message(null)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void lookupRiotRank()
                  }
                }}
                placeholder="NomeDoInvocador#TAG"
                className="input-base flex-1"
                maxLength={32}
              />
              <button
                type="button"
                onClick={() => void lookupRiotRank()}
                disabled={riotLookupLoading}
                className={cn(
                  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all',
                  'bg-brand text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed',
                )}
              >
                <Search className="h-4 w-4" />
                {riotLookupLoading ? 'Consultando...' : 'Verificar elo'}
              </button>
            </div>
            {riotLookupMessage && (
              <p className="mt-2 text-xs text-success">{riotLookupMessage}</p>
            )}
            {riotLookupError && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-warning">
                <AlertCircle className="h-3.5 w-3.5" />
                {riotLookupError}
              </p>
            )}
          </FormField>
        )}

        {/* Duo Boost toggle — não existe no fluxo Master+ */}
        {serviceType === 'elo_boost' && !currentIsMasterPlus && (
          <FormField label="Extras" hint="Duo Boost: você joga junto ao booster na duo queue (+50% no preço).">
            <button
              type="button"
              onClick={() => setBoostMode(boostMode === 'duo' ? 'solo' : 'duo')}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left',
                boostMode === 'duo'
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30 hover:text-ink',
              )}
            >
              <div>
                <p className="text-sm font-bold">Duo Boost <span className="text-xs font-normal opacity-70">(+50%)</span></p>
                <p className="text-[11px] font-normal mt-0.5 opacity-70">Você joga junto com o booster na duo queue</p>
              </div>
              <div className={cn(
                'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0',
                boostMode === 'duo' ? 'border-brand bg-brand' : 'border-bg-overlay',
              )}>
                {boostMode === 'duo' && <Check className="h-3 w-3 text-white" />}
              </div>
            </button>
          </FormField>
        )}

        {/* Vitórias/MD5: Riot ID vem primeiro neste fluxo — a checagem de
            elegibilidade MD5 precisa acontecer antes de qualquer outro campo. */}
        {(serviceType === 'win_boost' || serviceType === 'md5') && (
          <FormField label="Riot ID" required hint="Informe seu Nome#TAG. Usamos isso para checar automaticamente se sua conta já tem rank nesta fila (MD5).">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={riotId}
                onChange={e => {
                  setRiotId(e.target.value)
                  setRiotLookupMessage(null)
                  setRiotLookupError(null)
                  setMd5Message(null)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void lookupForWinBoost()
                  }
                }}
                placeholder="NomeDoInvocador#TAG"
                className="input-base flex-1"
                maxLength={32}
              />
              <button
                type="button"
                onClick={() => void lookupForWinBoost()}
                disabled={riotLookupLoading}
                className={cn(
                  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all',
                  'bg-brand text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed',
                )}
              >
                <Search className="h-4 w-4" />
                {riotLookupLoading ? 'Consultando...' : 'Verificar elo'}
              </button>
            </div>
            {md5Message && <p className="mt-2 text-xs text-success">{md5Message}</p>}
            {riotLookupMessage && !md5Message && <p className="mt-2 text-xs text-ink-secondary">{riotLookupMessage}</p>}
            {riotLookupError && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-warning">
                <AlertCircle className="h-3.5 w-3.5" />
                {riotLookupError}
              </p>
            )}
          </FormField>
        )}

        {/* MD5 toggle — logo abaixo do Riot ID, antes da grade de vitórias. */}
        {(serviceType === 'win_boost' || serviceType === 'md5') && (
          <FormField label="Extras" hint="MD5: garantimos 80%+ de win rate nas suas partidas de posicionamento restantes, com desconto no preço por vitória.">
            <button
              type="button"
              onClick={() => setIsMd5(!isMd5)}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left',
                isMd5
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30 hover:text-ink',
              )}
            >
              <div>
                <p className="text-sm font-bold">MD5 <span className="text-xs font-normal opacity-70">(garantia de win rate)</span></p>
                <p className="text-[11px] font-normal mt-0.5 opacity-70">
                  {md5MatchesRemaining == null && 'Disponível só para contas ainda não rankeadas nesta fila'}
                </p>
              </div>
              <div className={cn(
                'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0',
                isMd5 ? 'border-brand bg-brand' : 'border-bg-overlay',
              )}>
                {isMd5 && <Check className="h-3 w-3 text-white" />}
              </div>
            </button>
          </FormField>
        )}

        {/* Partidas restantes — só quando MD5 está ativo e o teto já foi
            detectado pela Riot. */}
        {(serviceType === 'win_boost' || serviceType === 'md5') && isMd5 && md5MatchesRemaining != null && (
          <FormField label="Partidas Restantes para o Booster" hint="Detectado automaticamente pela Riot. Você pode diminuir se já jogou mais partidas depois da checagem, mas não aumentar.">
            <div className="flex items-center gap-0 rounded-xl border-2 border-bg-elevated bg-bg-card overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => setMd5MatchesRemaining(md5MatchesRemaining - 1)}
                disabled={md5MatchesRemaining <= 0}
                className="px-4 py-3 text-lg font-bold text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                -
              </button>
              <div className="px-6 py-3 text-center min-w-[110px] border-x border-bg-elevated">
                <p className="text-xl font-extrabold text-ink leading-none">{md5MatchesRemaining}</p>
                <p className="text-[10px] text-ink-muted mt-0.5">partida(s)</p>
              </div>
              <button
                type="button"
                onClick={() => setMd5MatchesRemaining(md5MatchesRemaining + 1)}
                disabled={md5MatchesRemaining >= (md5MatchesRemainingCeiling ?? 5)}
                className="px-4 py-3 text-lg font-bold text-ink-secondary hover:text-ink hover:bg-bg-elevated transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          </FormField>
        )}

        {/* Vitórias — grade de botões 1..5 (ou até o teto de partidas
            restantes, se MD5). Substitui o antigo stepper -/contagem/+. */}
        {(serviceType === 'win_boost' || serviceType === 'md5') && (
          <FormField label="Número de Vitórias" required>
            <WinCountButtons
              value={winsPurchased}
              max={isMd5 ? Math.max(1, md5MatchesRemaining ?? 5) : 5}
              onChange={setWinsPurchased}
            />
            <p className="text-xs text-ink-muted mt-1.5">
              {isMd5 ? `Máximo ${Math.max(1, md5MatchesRemaining ?? 5)} (partidas restantes)` : 'Máximo 5'}
            </p>
          </FormField>
        )}

        {/* Queue type — compartilhado entre elo_boost e win_boost/md5. No
            fluxo Vitórias/MD5 este campo vem depois de Riot ID/MD5/vitórias
            (ver bloco acima); no fluxo elo_boost continua logo após Duo Boost. */}
        {(serviceType === 'elo_boost' || serviceType === 'win_boost' || serviceType === 'md5') && (
          <FormField label="Tipo de Fila" required>
            <div className="flex gap-3">
              {(['solo_duo', 'flex'] as QueueType[]).map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQueueType(q)}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all',
                    queueType === q
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30',
                  )}
                >
                  {q === 'solo_duo' ? 'Solo/Duo' : 'Flex'}
                </button>
              ))}
            </div>
          </FormField>
        )}

        {/* Rank selection — elo boost (split two-column layout) */}
        {serviceType === 'elo_boost' && (
          <div className="rounded-2xl border border-bg-elevated overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* ── Current rank column ── */}
              <div className="p-4 space-y-4 border-b border-bg-elevated md:border-b-0 md:border-r">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Rank Atual</p>
                  {riotAutoFilled && (
                    <button type="button" onClick={() => setRiotAutoFilled(false)} className="text-[10px] font-bold text-brand hover:underline">
                      Editar
                    </button>
                  )}
                </div>

                <RankLockGrid
                  tiers={RANK_TIER_ORDER.filter(t => t !== 'challenger')}
                  current={null}
                  selectedTier={currentRank?.tier ?? null}
                  selectedDivision={currentRank?.division ?? null}
                  onChange={(tier, division) => setCurrentRank({ tier, division })}
                  disabled={riotAutoFilled}
                />

                {/* PDL Atual — mesmo cartão para os dois fluxos, só trocando
                    quais campos do estado ficam ligados a cada input. Master+
                    não tem PDL alvo — o preço depende da faixa do PDL atual,
                    não de um alvo informado pelo cliente. */}
                {currentRank && (
                  <div className="rounded-xl border border-bg-elevated bg-bg-elevated/20 p-3 space-y-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted">PDL Atual</p>
                    {currentIsMasterPlus ? (
                      <PdlFieldRow fields={[
                        { label: 'PDL Atual', value: currentPdl, min: 0, max: 9999, onChange: setCurrentPdl, disabled: riotAutoFilled },
                        { label: 'Média/Partida', value: avgPdlGain, min: 1, max: 200, onChange: setAvgPdlGain, disabled: riotAutoFilled },
                      ]} />
                    ) : (
                      <PdlFieldRow fields={[
                        { label: 'LP Atual', value: currentLp, min: 0, max: 99, onChange: setCurrentLp, disabled: riotAutoFilled },
                        { label: 'Média/Partida', value: avgLpGain, min: 1, max: 50, onChange: setAvgLpGain, disabled: riotAutoFilled },
                      ]} />
                    )}
                    {riotAutoFilled && (
                      <p className="text-[10px] text-ink-muted">
                        Preenchido automaticamente pela Riot. Para editar, refaça a busca com outro Riot ID.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Target rank column ── */}
              <div className="p-4 space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Rank Alvo</p>

                {!currentRank ? (
                  <p className="text-xs text-ink-muted pt-2">Selecione o rank atual primeiro.</p>
                ) : currentIsMasterPlus ? (
                  <div className="space-y-2">
                    {masterPlusTargets.map(tier => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setTargetRank({ tier, division: null })}
                        disabled={currentRank.tier === 'grandmaster'}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left',
                          targetRank?.tier === tier
                            ? 'border-brand bg-brand/10 text-brand'
                            : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30',
                          currentRank.tier === 'grandmaster' && 'cursor-default',
                        )}
                      >
                        <RankBadge tier={tier} size="xs" showLabel={false} />
                        <span className="text-sm font-bold">{RANK_TIER_LABEL[tier]}</span>
                      </button>
                    ))}
                    {currentRank.tier === 'grandmaster' && (
                      <p className="text-[11px] text-ink-muted">Único destino possível a partir de Grão-Mestre.</p>
                    )}
                    {loadingMasterPlusPrice && <p className="text-[11px] text-ink-muted">Calculando preço…</p>}
                    {!loadingMasterPlusPrice && targetRank && masterPlusPriceRow?.price == null && (
                      <p className="text-[11px] text-warning">Preço ainda não configurado para essa combinação. Fale com o suporte.</p>
                    )}
                  </div>
                ) : (
                  // Rank alvo do fluxo padrão pode ir além de Diamond — até
                  // Master/Grão-Mestre/Challenger — usando a mesma progressão
                  // por degrau (o preço de cada degrau acima de Diamond segue
                  // a taxa de Diamante). O fluxo Master+ propriamente dito só
                  // se aplica quando o rank ATUAL já é Master/Grão-Mestre.
                  <RankLockGrid
                    tiers={RANK_TIER_ORDER}
                    current={currentRank}
                    selectedTier={targetRank?.tier ?? null}
                    selectedDivision={targetRank?.division ?? null}
                    onChange={(tier, division) => setTargetRank({ tier, division })}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Rank — win boost / MD5 */}
        {(serviceType === 'win_boost' || serviceType === 'md5') && (
          <FormField
            label={isMd5 ? 'Rank da Última Temporada' : 'Rank Atual'}
            required
            hint={isMd5 ? 'Sem LP - apenas o rank final da temporada passada.' : undefined}
            labelAction={riotAutoFilled && (
              <button type="button" onClick={() => setRiotAutoFilled(false)} className="text-[10px] font-bold text-brand hover:underline">
                Editar
              </button>
            )}
          >
            <RankLockGrid
              tiers={RANK_TIER_ORDER}
              current={null}
              selectedTier={currentRank?.tier ?? null}
              selectedDivision={currentRank?.division ?? null}
              onChange={(tier, division) => setCurrentRank({ tier, division })}
              disabled={riotAutoFilled}
            />
          </FormField>
        )}

        {/* Rank — placement matches */}
        {serviceType === 'placement_matches' && (
          <FormField label="Rank Final da Última Temporada" required>
            <RankLockGrid
              tiers={RANK_TIER_ORDER}
              current={null}
              selectedTier={currentRank?.tier ?? null}
              selectedDivision={currentRank?.division ?? null}
              onChange={(tier, division) => setCurrentRank({ tier, division })}
            />
          </FormField>
        )}

        {/* Coaching — escolhe um pacote real de um booster; preço vem do
            pacote, nunca é combinado depois. */}
        {serviceType === 'coaching' && <CoachPackagePicker />}
      </div>
    </div>
  )
}
