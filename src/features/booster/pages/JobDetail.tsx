import { useParams, Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { AUTO_SYNC_INTERVAL_MS, shouldAutoSync } from '@/lib/matchSync'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Play, CheckCircle2, AlertTriangle, Lock, ShieldCheck, KeyRound, Copy, Check, Landmark, RefreshCcw,
  Gamepad2, Users, Shuffle, TrendingUp, Trophy, Wallet, Hash,
} from 'lucide-react'
import { Button, Card, OrderStatusBadge, RankBadge, Modal, ErrorAlert, PageLoader } from '@/components/ui'
import { OrderChat } from '@/components/order/OrderChat'
import { useOrderChat } from '@/api/chat'
import { OrderMatchHistory } from '@/components/order/OrderMatchHistory'
import { OrderCoachingTopics } from '@/components/order/OrderCoachingTopics'
import { OrderProgress } from '@/components/order/OrderProgress'
import { OrderRankSummary } from '@/components/order/OrderRankSummary'
import { OrderTimeline } from '@/components/order/OrderTimeline'
import { CountdownTimer } from '@/components/order/CountdownTimer'
import { useAuthStore } from '@/stores/authStore'
import { useCurrency } from '@/hooks/useCurrency'
import { formatRank, RANK_TIER_LABEL, boosterEarningsShare, getServiceLabel, getOrderModeType, sortOrderExtras, orderRequiresAccountAccess } from '@/lib/utils'
import { CLASH_TIER_LABEL, CLASH_TIER_RANGE_LABEL, CLASH_DAY_LABEL } from '@/lib/clashDomain'
import { canMarkOrderComplete } from '@/lib/orderCompletionGate'
import {
  useBoosterOrder, usePendingDropRequest, useUpdateOrderStatus, useSyncOrderMatches, useVerifyOrderRank,
  useRevealOrderCredentials, useRequestOrderDrop, useOrderStatusHistory,
} from '@/api/orders'
import { useOwnBoosterTop3Status } from '@/api/boosters'
import { useBoosterServiceDetails } from '@/api/coaching'
import {
  useBoosterDuoAccounts, useReserveDuoAccount, useGetDuoAccountAccessToken, useReleaseDuoAccountReservation,
  useSetDuoOwnRiotId, useClearDuoOwnRiotId,
} from '@/api/duoAccounts'
import type { BoosterVisibleDuoAccount } from '@/api/duoAccounts'
import { rankStep } from '@/lib/pricing'
import type { Order, OrderStatus, RankTier } from '@/types'

// Janela de proximidade de elo pra filtrar contas Duo disponíveis
// automaticamente: até Esmeralda I, aceita ±1 divisão inteira (4 degraus de
// rankStep); a partir de Diamante, a janela fecha pra ±2 subdivisões só --
// matchmaking fica mais sensível a diferença de elo nesse patamar.
const DUO_RANK_WINDOW_EMERALD_I_STEP = rankStep('emerald', 'I')

function withinDuoRankWindow(clientStep: number, accountStep: number): boolean {
  const windowSize = clientStep <= DUO_RANK_WINDOW_EMERALD_I_STEP ? 4 : 2
  return Math.abs(accountStep - clientStep) <= windowSize
}

function DuoAccountSection({ order, onLinked }: { order: Order; onLinked?: () => void }) {
  const { profile } = useAuthStore()
  const [accountSource, setAccountSource] = useState<'platform' | 'own'>(order.duo_own_riot_id ? 'own' : 'platform')
  const [ownRiotId, setOwnRiotId] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [switching, setSwitching] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [search, setSearch] = useState('')

  const { data: accounts, isLoading } = useBoosterDuoAccounts()
  const reserve = useReserveDuoAccount()
  const getToken = useGetDuoAccountAccessToken()
  const release = useReleaseDuoAccountReservation()
  const setOwnAccount = useSetDuoOwnRiotId()
  const clearOwnAccount = useClearDuoOwnRiotId()

  const reserved = (accounts as BoosterVisibleDuoAccount[] | undefined)?.find(a => a.reserved_by === profile?.id && a.reserved_order_id === order.id)

  // Elo atual do cliente neste pedido -- referência pra janela de proximidade
  // abaixo. Sem ele (raro, mas possível), não dá pra filtrar por elo: mostra
  // todas as contas em vez de esconder tudo por falta de dado.
  const clientStep = order.current_rank ? rankStep(order.current_rank.tier, order.current_rank.division) : null

  const available = ((accounts as BoosterVisibleDuoAccount[] | undefined)?.filter(a => a.reserved_by === null) ?? []).filter((a) => {
    if (search.trim() && !(a.riot_id ?? a.label).toLowerCase().includes(search.trim().toLowerCase())) return false
    if (clientStep != null) {
      if (!a.current_rank) return false
      if (!withinDuoRankWindow(clientStep, rankStep(a.current_rank.tier, a.current_rank.division))) return false
    }
    return true
  })

  function doSaveOwnAccount() {
    setOwnAccount.mutate({ orderId: order.id, riotId: ownRiotId.trim() }, {
      onSuccess: () => { setOwnRiotId(''); onLinked?.() },
    })
  }

  function doClearOwnAccount() {
    clearOwnAccount.mutate(order.id)
  }

  function doReserve() {
    reserve.mutate({ orderId: order.id, accountId: selectedAccountId }, {
      onSuccess: () => { setSwitching(false); setAccessToken(null); onLinked?.() },
    })
  }

  function doRelease() {
    release.mutate(order.id, { onSuccess: () => { setSwitching(false); setAccessToken(null) } })
  }

  function doGetToken() {
    if (!reserved) return
    getToken.mutate(reserved.id, {
      onSuccess: (result) => setAccessToken(result.access_token ?? null),
    })
  }

  async function copyToken() {
    if (!accessToken) return
    await navigator.clipboard.writeText(accessToken)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 1500)
  }

  const reserveErrorMessage = (msg: string) =>
    msg === 'account_unavailable' ? 'Essa conta acabou de ser reservada por outro booster. Escolha outra.' : msg

  return (
    <Card padding="md">
      <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
        <Landmark className="h-4 w-4 text-brand" />
        Conta Duo
      </h3>

      {/* Alternar de aba não mexe no que já está salvo em cada lado -- só
          muda o que fica visível. */}
      <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-xl bg-bg-elevated p-1">
        <button
          type="button"
          onClick={() => setAccountSource('platform')}
          className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${accountSource === 'platform' ? 'bg-bg-surface text-ink shadow-sm' : 'text-ink-muted'}`}
        >
          Conta da plataforma
        </button>
        <button
          type="button"
          onClick={() => setAccountSource('own')}
          className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${accountSource === 'own' ? 'bg-bg-surface text-ink shadow-sm' : 'text-ink-muted'}`}
        >
          Conta própria
        </button>
      </div>

      {accountSource === 'own' ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-secondary">
            Use sua própria conta pra jogar com o cliente — só o Riot ID, sem token (você já tem acesso).
          </p>
          {order.duo_own_riot_id ? (
            <div className="flex items-center justify-between bg-bg-elevated rounded-xl px-3 py-2.5">
              <p className="text-sm font-semibold text-ink truncate">{order.duo_own_riot_id}</p>
              <Button size="sm" variant="danger-ghost" loading={clearOwnAccount.isPending} onClick={doClearOwnAccount}>
                Remover
              </Button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <input
                value={ownRiotId}
                onChange={(e) => setOwnRiotId(e.target.value)}
                placeholder="Nome#TAG"
                className="input-base flex-1 text-sm"
              />
              <Button size="sm" disabled={!ownRiotId.trim()} loading={setOwnAccount.isPending} onClick={doSaveOwnAccount}>
                Salvar
              </Button>
            </div>
          )}
          {(setOwnAccount.isError || clearOwnAccount.isError) && (
            <ErrorAlert
              message={
                (setOwnAccount.error instanceof Error && setOwnAccount.error.message) ||
                (clearOwnAccount.error instanceof Error && clearOwnAccount.error.message) ||
                'Erro ao salvar conta'
              }
            />
          )}
        </div>
      ) : isLoading ? (
        <p className="text-xs text-ink-muted">Carregando contas...</p>
      ) : reserved && !switching ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-bg-elevated rounded-xl px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-ink">{reserved.riot_id ?? reserved.label}</p>
              {reserved.current_rank && (
                <p className="text-xs text-ink-muted">
                  {RANK_TIER_LABEL[reserved.current_rank.tier]} {reserved.current_rank.division}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="secondary" leftIcon={<RefreshCcw className="h-3.5 w-3.5" />} onClick={() => setSwitching(true)}>
                Trocar
              </Button>
              <Button size="sm" variant="danger-ghost" loading={release.isPending} onClick={doRelease}>
                Liberar
              </Button>
            </div>
          </div>

          {accessToken ? (
            <div className="space-y-2">
              <textarea readOnly value={accessToken} className="input-base w-full min-h-[80px] text-[11px] font-mono resize-none" spellCheck={false} />
              <Button size="sm" className="w-full" variant={tokenCopied ? 'success' : 'secondary'} leftIcon={<Copy className="h-3.5 w-3.5" />} onClick={() => void copyToken()}>
                {tokenCopied ? 'Copiado' : 'Copiar token'}
              </Button>
              <p className="text-[10px] text-ink-muted">Use este token apenas no aplicativo autorizado — login e senha não são exibidos.</p>
            </div>
          ) : (
            <Button size="sm" className="w-full" leftIcon={<KeyRound className="h-3.5 w-3.5" />} loading={getToken.isPending} onClick={doGetToken}>
              Obter token de acesso
            </Button>
          )}
          {getToken.isError && (
            <ErrorAlert message={getToken.error instanceof Error ? getToken.error.message : 'Erro ao obter token'} />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nick..." className="input-base w-full text-xs" />
          <p className="text-[10px] text-ink-muted">
            {clientStep != null
              ? `Contas filtradas automaticamente pelo elo do cliente (${clientStep <= DUO_RANK_WINDOW_EMERALD_I_STEP ? '±1 divisão' : '±2 subdivisões'}).`
              : 'Sem elo atual do cliente pra filtrar — mostrando todas as contas disponíveis.'}
          </p>

          {available.length === 0 ? (
            <p className="text-xs text-ink-muted py-2">Nenhuma conta Duo disponível nessa faixa de elo.</p>
          ) : (
            <div className="max-h-52 space-y-1.5 overflow-y-auto pr-0.5">
              {available.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAccountId(a.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                    selectedAccountId === a.id ? 'border-brand bg-brand/10' : 'border-border-subtle hover:bg-bg-elevated/60'
                  }`}
                >
                  {a.current_rank && <RankBadge tier={a.current_rank.tier} division={a.current_rank.division} size="xs" showLabel={false} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{a.riot_id ?? a.label}</p>
                    {a.current_rank && <p className="text-[10px] text-ink-muted">{RANK_TIER_LABEL[a.current_rank.tier]} {a.current_rank.division}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}

          <Button size="sm" className="w-full" disabled={!selectedAccountId} loading={reserve.isPending} onClick={doReserve}>
            Reservar esta conta
          </Button>
          {switching && (
            <Button size="sm" variant="ghost" className="w-full" onClick={() => setSwitching(false)}>Cancelar</Button>
          )}
          {reserve.isError && (
            <ErrorAlert message={reserve.error instanceof Error ? reserveErrorMessage(reserve.error.message) : 'Erro ao reservar conta'} />
          )}
        </div>
      )}
    </Card>
  )
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuthStore()
  const [dropReason, setDropReason] = useState('')
  const [showDropModal, setShowDropModal] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null)
  const [tokenSecondsLeft, setTokenSecondsLeft] = useState(0)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [nickCopied, setNickCopied] = useState(false)
  const { t } = useTranslation()
  const currency = useCurrency()

  // "Concluir" (in_progress -> awaiting_customer) saiu daqui -- agora é um
  // botão dedicado no rodapé do card de Detalhes, ao lado de "Verificar
  // Rank e Concluir" (ver mais abaixo). Só resta a transição de início.
  // Só resta a transição de início agora -- "Concluir" (variant 'success')
  // saiu daqui pro rodapé do card de Detalhes, então o tipo não precisa mais
  // cobrir todos os variants de Button, só o único que sobrou.
  const STATUS_ACTIONS: { from: OrderStatus[]; to: OrderStatus; label: string; icon: React.ElementType; variant: 'primary' }[] = [
    { from: ['assigned'], to: 'in_progress', label: t('booster.job.startOrder'), icon: Play, variant: 'primary' },
  ]

  const { data: isTop3 } = useOwnBoosterTop3Status(profile?.id)

  const { data: order, isLoading: loadingOrder, isError: orderError, refetch: refetchOrder } = useBoosterOrder(id)
  const { data: pendingDrop } = usePendingDropRequest(id)
  const { data: history } = useOrderStatusHistory(id)
  // Dispara a busca do chat em paralelo com o pedido, em vez de esperar
  // loadingOrder resolver pra só então montar <OrderChat> -- mesma query key
  // do hook interno dele, então o resultado já vem do cache quando ele monta.
  useOrderChat(id)
  // Chamado incondicionalmente (regra dos hooks) mesmo antes de `order`
  // existir -- enabled: !!id internamente cobre o caso undefined.
  const { data: coachPackage } = useBoosterServiceDetails(order?.booster_service_id ?? undefined)

  const updateStatus = useUpdateOrderStatus(id ?? '')
  const syncMatches = useSyncOrderMatches(id ?? '')

  // Auto-sync: dispara sozinho quando a tela abre com um pedido
  // sincronizável e o último sync (automático ou manual, via
  // order.last_match_synced_at) já passou de 30 min -- reavalia a cada 30
  // min enquanto a tela ficar aberta. orderRef evita fechar sobre um
  // `order` desatualizado dentro do setInterval sem precisar recriá-lo a
  // cada refetch (o que reiniciaria a contagem).
  const orderRef = useRef(order)
  orderRef.current = order

  useEffect(() => {
    if (!order) return
    function maybeSync() {
      const current = orderRef.current
      if (current && shouldAutoSync(current, Date.now())) syncMatches.mutate()
    }
    maybeSync()
    const intervalId = setInterval(maybeSync, AUTO_SYNC_INTERVAL_MS)
    return () => clearInterval(intervalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.status])
  const verifyRank = useVerifyOrderRank(id ?? '')
  const revealAccessToken = useRevealOrderCredentials()
  const requestDrop = useRequestOrderDrop(id ?? '')

  function doRevealToken() {
    revealAccessToken.mutate(id!, {
      onSuccess: (result) => {
        setAccessToken(result.access_token ?? null)
        setTokenExpiresAt(result.expires_at ?? null)
      },
    })
  }

  // Contagem regressiva dos 5 minutos de validade do token -- ao zerar, o
  // token some da tela e só um novo clique em "Criar token" gera outro
  // (uso único, nunca mostra o mesmo token duas vezes).
  useEffect(() => {
    if (!tokenExpiresAt) { setTokenSecondsLeft(0); return }
    function tick() {
      const secondsLeft = Math.max(0, Math.round((new Date(tokenExpiresAt!).getTime() - Date.now()) / 1000))
      setTokenSecondsLeft(secondsLeft)
      if (secondsLeft <= 0) { setAccessToken(null); setTokenExpiresAt(null) }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [tokenExpiresAt])

  async function copyAccessToken() {
    if (!accessToken) return
    await navigator.clipboard.writeText(accessToken)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 1500)
  }

  async function copyNickname() {
    if (!order?.riot_id) return
    await navigator.clipboard.writeText(order.riot_id)
    setNickCopied(true)
    setTimeout(() => setNickCopied(false), 1500)
  }

  if (loadingOrder) return <PageLoader />

  if (orderError) {
    return (
      <div className="space-y-4">
        <ErrorAlert message="Não foi possível carregar o pedido. Tente novamente." />
        <Button onClick={() => refetchOrder()}>Tentar novamente</Button>
      </div>
    )
  }

  if (!order) return null

  const completionGate = canMarkOrderComplete(order, new Date())
  const objectiveReached = completionGate.allowed
  const availableActions = STATUS_ACTIONS.filter(a => a.from.includes(order.status))
  // "Toda hora" (qualquer status ativo), não só 'in_progress' -- mesma janela
  // de status droppable já usada no lado do cliente (CUSTOMER_DROPPABLE_STATUSES).
  const dropVisible = ['assigned', 'in_progress', 'paused', 'awaiting_customer'].includes(order.status) && !pendingDrop
  const verifyVisible = ['in_progress', 'paused', 'awaiting_customer'].includes(order.status) && !!order.target_rank && !!order.riot_id
  const completeVisible = order.status === 'in_progress' && objectiveReached
  const completeBlockedInfo = order.status === 'in_progress' && !objectiveReached
  const showDetailsFooter = dropVisible || verifyVisible || completeVisible || completeBlockedInfo
  const nicknameVisible = !!order.riot_id && (order.service_type === 'elo_boost' || order.service_type === 'win_boost' || order.service_type === 'md5')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar">
          <Link to="/booster/jobs"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-ink">#{order.id.slice(0, 8).toUpperCase()}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
        </div>
        {['in_progress', 'paused', 'awaiting_customer'].includes(order.status) && (
          <CountdownTimer startedAt={order.match_sync_started_at} estimatedHours={order.estimated_hours} />
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-4">{t('booster.job.details')}</h3>

            {order.service_type === 'coaching' && coachPackage && (
              <div className="mb-4 pb-4 border-b border-border-subtle space-y-2">
                <p className="text-base font-bold text-ink">{coachPackage.title}</p>
                {coachPackage.description && (
                  <p className="text-sm text-ink-secondary leading-relaxed">{coachPackage.description}</p>
                )}
                {coachPackage.tempo && (
                  <p className="text-xs text-ink-muted">Duração: <span className="font-semibold text-ink">{coachPackage.tempo}</span></p>
                )}
              </div>
            )}

            {order.service_type === 'clash' && order.clash_tier && (
              <div className="mb-4 pb-4 border-b border-border-subtle space-y-2">
                <p className="text-base font-bold text-ink">{order.boost_mode === 'duo' ? 'Duo Clash' : 'Solo Clash'}</p>
                <p className="text-sm text-ink-secondary leading-relaxed">
                  {order.boost_mode === 'duo'
                    ? 'Cliente joga junto com você — monte o restante do time dentro do jogo.'
                    : 'Você entra na conta do cliente e monta o time dentro do jogo.'}
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-xs text-ink-muted">
                  <span>{CLASH_TIER_LABEL[order.clash_tier]}: <span className="font-semibold text-ink">{CLASH_TIER_RANGE_LABEL[order.clash_tier]}</span></span>
                  {order.clash_day && <span>Dia: <span className="font-semibold text-ink">{CLASH_DAY_LABEL[order.clash_day]}</span></span>}
                  {order.riot_id && (
                    <span className="inline-flex items-center gap-1.5">
                      <Hash className="h-3 w-3 shrink-0" />
                      Riot ID: <span className="font-semibold text-ink">{order.riot_id}</span>
                      <button
                        type="button"
                        onClick={() => void copyNickname()}
                        aria-label="Copiar Riot ID"
                        className="text-ink-muted hover:text-brand transition-colors"
                      >
                        {nickCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-brand pt-1">
                  A montagem do time é sua responsabilidade — organize dentro do League of Legends.
                  {order.boost_mode === 'duo' && ' Use o Riot ID acima para convidar o cliente para o time.'}
                </p>
              </div>
            )}

            <OrderRankSummary order={order} />
            {order.pdl_bracket && (
              <p className="text-xs text-ink-muted flex items-center justify-center gap-1 -mt-2 mb-4">
                <TrendingUp className="h-3 w-3 shrink-0" />
                Méd. Ganho/Perda: <span className="font-semibold text-ink">+{order.avg_pdl_gain ?? '—'} / −{order.avg_pdl_loss ?? '—'} PDL</span>
              </p>
            )}
            <OrderProgress order={order} hideRankBadges />

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><p className="text-xs text-ink-muted flex items-center gap-1"><Gamepad2 className="h-3 w-3 shrink-0" />Serviço</p><p className="text-sm font-semibold text-ink">{getServiceLabel(order.service_type)}</p></div>
              <div><p className="text-xs text-ink-muted flex items-center gap-1"><Shuffle className="h-3 w-3 shrink-0" />Tipo</p><p className="text-sm font-semibold text-ink">{getOrderModeType(order)}</p></div>
              {(order.service_type === 'elo_boost' || order.service_type === 'win_boost' || order.service_type === 'md5') && (
                <div><p className="text-xs text-ink-muted flex items-center gap-1"><Users className="h-3 w-3 shrink-0" />{t('booster.job.queue')}</p><p className="text-sm font-semibold text-ink">{order.queue_type === 'solo_duo' ? t('booster.job.soloQueue') : t('booster.job.flexQueue')}</p></div>
              )}
              {(order.service_type === 'win_boost' || order.service_type === 'md5') && order.wins_purchased != null && (
                <div><p className="text-xs text-ink-muted flex items-center gap-1"><Trophy className="h-3 w-3 shrink-0" />Vitórias Compradas</p><p className="text-sm font-semibold text-ink">{order.wins_purchased}</p></div>
              )}
            </div>

            {nicknameVisible && (
              <div className="flex items-center justify-between gap-3 bg-bg-elevated rounded-xl px-3 py-2.5 mb-4">
                <div className="min-w-0">
                  <p className="text-xs text-ink-muted flex items-center gap-1"><Hash className="h-3 w-3 shrink-0" />Nickname do cliente</p>
                  <p className="text-sm font-semibold text-ink truncate">{order.riot_id}</p>
                </div>
                <Button
                  size="xs" variant={nickCopied ? 'success' : 'secondary'}
                  leftIcon={nickCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  onClick={() => void copyNickname()}
                >
                  {nickCopied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            )}
            {order.extras?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-ink-muted mb-1.5">Extras</p>
                <div className="flex flex-wrap gap-1.5">
                  {sortOrderExtras(order.extras).map((extra) => (
                    <span key={extra.extra_id} className="text-[11px] font-medium bg-bg-elevated text-ink-secondary px-2 py-1 rounded-lg">{extra.name}</span>
                  ))}
                </div>
              </div>
            )}
            {order.customer_notes && (
              <div className="bg-bg-elevated rounded-xl p-3">
                <p className="text-xs text-ink-muted mb-1">{t('booster.job.customerNotes')}</p>
                <p className="text-sm text-ink-secondary">{order.customer_notes}</p>
              </div>
            )}

            {/* Ganhos mesclado aqui -- só a comissão, sem total do pedido
                (isso é exclusivo do cliente) e sem label de percentual. */}
            <div className="mt-4 pt-4 border-t border-border-subtle flex items-center gap-2">
              <Wallet className="h-4 w-4 text-success shrink-0" />
              <div>
                <p className="text-xs text-ink-muted">{t('booster.job.earnings')}</p>
                <p className="text-lg font-bold text-success" data-tabular>{currency(order.total_price * boosterEarningsShare(isTop3))}</p>
              </div>
            </div>

            {/* Ações do booster -- Drop à esquerda, Verificar/Concluir à
                direita, no rodapé do próprio card de Detalhes (sincronizar
                partidas mora no card de Histórico de partidas, não aqui). */}
            {showDetailsFooter && (
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    {dropVisible && (
                      <Button variant="danger-ghost" size="sm" leftIcon={<AlertTriangle className="h-4 w-4" />} onClick={() => setShowDropModal(true)}>
                        Solicitar Drop
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {verifyVisible && (
                      <Button variant="secondary" size="sm" leftIcon={<ShieldCheck className="h-4 w-4" />} loading={verifyRank.isPending} onClick={() => verifyRank.mutate()}>
                        Verificar Resultado
                      </Button>
                    )}
                    {completeVisible && (
                      <Button variant="success" size="sm" leftIcon={<CheckCircle2 className="h-4 w-4" />} loading={updateStatus.isPending} onClick={() => updateStatus.mutate('awaiting_customer')}>
                        Concluir
                      </Button>
                    )}
                  </div>
                </div>

                {verifyRank.isError && (
                  <ErrorAlert message={verifyRank.error instanceof Error ? verifyRank.error.message : 'Erro ao verificar rank'} className="mt-3" />
                )}
                {verifyRank.data && !verifyRank.data.passed && (
                  <div className="text-xs text-warning mt-3 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                    {verifyRank.data.reason === 'account_not_found' && 'Conta Riot não encontrada. Confira o Riot ID cadastrado no pedido.'}
                    {verifyRank.data.reason === 'unranked' && 'A conta ainda não tem partidas ranqueadas solo/duo nesta temporada.'}
                    {verifyRank.data.reason === 'target_not_reached' && verifyRank.data.fetched_tier && (
                      <>
                        Rank atual verificado: <strong>{formatRank(verifyRank.data.fetched_tier as RankTier, verifyRank.data.fetched_division ?? null)}</strong> —
                        alvo: <strong>{formatRank(verifyRank.data.target_tier as RankTier, verifyRank.data.target_division ?? null)}</strong>. Ainda não bateu.
                      </>
                    )}
                  </div>
                )}
                {updateStatus.isError && (
                  <ErrorAlert
                    className="mt-3"
                    message={(() => {
                      const code = updateStatus.error instanceof Error ? updateStatus.error.message : null
                      if (code === 'objective_not_reached') return 'Ainda faltam vitórias contratadas para marcar como concluído.'
                      if (code === 'no_matches_played') return 'Sincronize ao menos 1 partida deste pedido antes de marcar como concluído.'
                      if (code === 'clash_completion_window_closed') return 'Clash só pode ser marcado como concluído a partir das 23h.'
                      return code ?? 'Erro ao atualizar status'
                    })()}
                  />
                )}
                {completeBlockedInfo && (
                  <p className="text-xs text-ink-muted mt-3">
                    {completionGate.reason === 'clash_completion_window_closed'
                      ? 'Disponível a partir das 23h.'
                      : 'Sincronize ao menos 1 partida deste pedido para poder marcar como concluído.'}
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Entre Detalhes do Pedido e Histórico de partidas -- tudo que é
              "mecânica de acesso à conta" (Duo, token) fica junto aqui, não
              espalhado pela sidebar. */}
          {order.boost_mode === 'duo' && order.assigned_booster_id === profile?.id
            && ['assigned', 'in_progress', 'paused'].includes(order.status) && (
            <DuoAccountSection order={order} onLinked={() => syncMatches.mutate()} />
          )}

          {orderRequiresAccountAccess(order) && order.assigned_booster_id === profile?.id
            && ['assigned', 'in_progress', 'paused', 'awaiting_customer'].includes(order.status) && (
            <Card padding="md">
              <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-brand" />
                Token de acesso
              </h3>
              <p className="text-xs text-ink-secondary mb-3">
                Cada token é de uso único e vale só 5 minutos. Use-o apenas no aplicativo autorizado para inicializar o client — login e senha não são exibidos.
              </p>

              {!order.credentials_set ? (
                <div className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                  O cliente ainda não cadastrou as credenciais de acesso.
                </div>
              ) : accessToken ? (
                <div className="space-y-2">
                  <textarea readOnly value={accessToken} className="input-base w-full min-h-[96px] text-[11px] font-mono resize-none" spellCheck={false} />
                  <p className="text-[11px] text-ink-muted text-center">
                    Expira em {Math.floor(tokenSecondsLeft / 60)}:{String(tokenSecondsLeft % 60).padStart(2, '0')}
                  </p>
                  <Button size="sm" className="w-full" variant={tokenCopied ? 'success' : 'secondary'} leftIcon={<Copy className="h-3.5 w-3.5" />} onClick={() => void copyAccessToken()}>
                    {tokenCopied ? 'Copiado' : 'Copiar token'}
                  </Button>
                  <Button size="sm" className="w-full" variant="ghost" leftIcon={<KeyRound className="h-3.5 w-3.5" />} loading={revealAccessToken.isPending} onClick={doRevealToken}>
                    Criar novo token
                  </Button>
                </div>
              ) : (
                <Button size="sm" className="w-full" leftIcon={<KeyRound className="h-3.5 w-3.5" />} loading={revealAccessToken.isPending} onClick={doRevealToken}>
                  Criar token
                </Button>
              )}

              {revealAccessToken.isError && (
                <ErrorAlert message={revealAccessToken.error instanceof Error ? revealAccessToken.error.message : 'Erro ao buscar token'} className="mt-2" />
              )}
            </Card>
          )}

          {order.service_type === 'coaching'
            ? ['assigned', 'in_progress', 'paused', 'awaiting_customer', 'completed'].includes(order.status) && (
              <OrderCoachingTopics orderId={order.id} />
            )
            : ['in_progress', 'paused', 'awaiting_customer', 'drop_requested', 'completed'].includes(order.status) && (
              <OrderMatchHistory
                orderId={order.id}
                sync={order.status === 'in_progress' || order.status === 'paused' ? {
                  onSync: () => syncMatches.mutate(),
                  syncing: syncMatches.isPending,
                  cooldownSeconds: syncMatches.cooldownSeconds,
                  error: syncMatches.isError ? (syncMatches.error instanceof Error ? syncMatches.error.message : 'Erro ao sincronizar partidas') : null,
                  resultMessage: syncMatches.data
                    ? (syncMatches.data.synced
                      ? (syncMatches.data.new_matches ? `${syncMatches.data.new_matches} nova(s) partida(s) registrada(s).` : 'Nenhuma partida nova encontrada.')
                      : 'Conta Riot não encontrada. Confira o Riot ID cadastrado no pedido.')
                    : null,
                } : undefined}
                pdlEstimate={order.service_type === 'elo_boost'
                  ? { gain: order.avg_pdl_gain, loss: order.avg_pdl_loss, label: order.pdl_bracket ? 'PDL' : 'LP' }
                  : null}
              />
            )}
        </div>

        <div className="space-y-4">
          {order.status === 'awaiting_customer' && (
            <Card padding="md" className="ring-1 ring-accent/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                <p className="text-sm text-ink-secondary">Objetivo alcançado! Aguardando a confirmação final do cliente.</p>
              </div>
            </Card>
          )}

          {order.status === 'completed' && (
            <Card padding="md" className="ring-1 ring-success/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <p className="text-sm text-ink-secondary">Serviço concluído! O cliente confirmou a entrega e seus ganhos foram liberados.</p>
              </div>
            </Card>
          )}

          {availableActions.length > 0 && (
            <Card padding="md">
              <h3 className="text-sm font-semibold text-ink mb-3">{t('booster.job.actions')}</h3>
              <div className="space-y-2">
                {availableActions.map(({ to, label, icon: Icon, variant }) => (
                  <Button key={to} variant={variant} className="w-full" leftIcon={<Icon className="h-4 w-4" />} loading={updateStatus.isPending} onClick={() => updateStatus.mutate(to)}>
                    {label}
                  </Button>
                ))}
              </div>
              {updateStatus.isError && (
                <ErrorAlert
                  className="mt-2"
                  message={updateStatus.error instanceof Error ? updateStatus.error.message : 'Erro ao atualizar status'}
                />
              )}
            </Card>
          )}

          {(order.status === 'drop_requested' || pendingDrop) && (
            <div className="card p-3 border border-warning/30 bg-warning/5">
              <div className="flex items-center gap-2 text-warning text-sm font-semibold">
                <Lock className="h-4 w-4" />
                Pedido travado · solicitação de drop em análise
              </div>
              <p className="text-xs text-ink-secondary mt-1">
                Aguardando o admin analisar o motivo. Nenhuma nova ação pode ser feita enquanto isso
                (credenciais, tokens de acesso e sincronização de partidas ficam bloqueados) —
                chat, histórico de partidas e histórico do pedido continuam disponíveis normalmente.
              </p>
            </div>
          )}

          <OrderChat orderId={order.id} viewerRole="booster" orderStatus={order.status} />

          <OrderTimeline history={history} />
        </div>
      </div>

      <Modal
        open={showDropModal}
        onOpenChange={(open) => { if (!open) { setShowDropModal(false); setDropReason('') } }}
        title="Solicitar Drop de Pedido"
        description="Sua solicitação será enviada ao admin para aprovação. Você recebe proporcional ao quanto já concluiu do pedido -- quanto mais avançado, maior o pagamento."
      >
        <div>
          <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
            Motivo <span className="text-danger">*</span>
          </label>
          <textarea value={dropReason} onChange={(e) => setDropReason(e.target.value)} placeholder="Descreva o motivo para abandonar o pedido..." className="input-base w-full min-h-[100px] resize-none text-sm" maxLength={500} />
        </div>
        {requestDrop.isError && (
          <ErrorAlert message={requestDrop.error instanceof Error ? requestDrop.error.message : 'Erro'} className="mt-2" />
        )}
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="ghost" onClick={() => { setShowDropModal(false); setDropReason('') }}>Cancelar</Button>
          <Button
            variant="danger"
            loading={requestDrop.isPending}
            disabled={dropReason.trim().length < 10}
            onClick={() => requestDrop.mutate(dropReason.trim(), { onSuccess: () => { setShowDropModal(false); setDropReason('') } })}
          >
            Enviar Solicitação
          </Button>
        </div>
      </Modal>
    </div>
  )
}
