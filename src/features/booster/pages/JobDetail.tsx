import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowLeft, Play, Pause, CheckCircle2, AlertTriangle, ShieldCheck, KeyRound, Copy, RefreshCw, Landmark, RefreshCcw } from 'lucide-react'
import { Button, Card, OrderStatusBadge, RankBadge, Modal, ErrorAlert, PageLoader } from '@/components/ui'
import { OrderChat } from '@/components/order/OrderChat'
import { OrderMatchHistory } from '@/components/order/OrderMatchHistory'
import { OrderProgress } from '@/components/order/OrderProgress'
import { CountdownTimer } from '@/components/order/CountdownTimer'
import { supabase } from '@/lib/supabase'
import { ORDER_SAFE_COLUMNS } from '@/lib/orderColumns'
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction'
import { useAuthStore } from '@/stores/authStore'
import { formatRank, RANK_TIER_LABEL, BOOSTER_EARNINGS_SHARE, sortOrderExtras, orderRequiresAccountAccess } from '@/lib/utils'
import type { Division, Order, OrderStatus, OrderDropRequest, RankTier } from '@/types'
import { useTranslation } from 'react-i18next'

type BoosterVisibleDuoAccount = {
  id: string
  label: string
  riot_id: string | null
  current_rank: { tier: RankTier; division: Division } | null
  is_active: boolean
  reserved_by: string | null
  reserved_order_id: string | null
}

const DUO_FILTER_TIERS: RankTier[] = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond']
const DUO_FILTER_DIVISIONS: Division[] = ['IV', 'III', 'II', 'I']

function DuoAccountSection({ order }: { order: Order }) {
  const queryClient = useQueryClient()
  const { profile } = useAuthStore()
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [switching, setSwitching] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<RankTier | 'all'>('all')
  const [divisionFilter, setDivisionFilter] = useState<Division | 'all'>('all')

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['booster-duo-accounts', order.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_duo_accounts')
      if (error) throw error
      const result = data as { success?: boolean; accounts?: BoosterVisibleDuoAccount[]; error?: string } | null
      if (!result?.success) throw new Error(result?.error ?? 'Não foi possível carregar as contas Duo.')
      return result.accounts ?? []
    },
  })

  const reserved = accounts?.find(a => a.reserved_by === profile?.id && a.reserved_order_id === order.id)
  const available = (accounts?.filter(a => a.reserved_by === null) ?? []).filter((a) => {
    if (search.trim() && !(a.riot_id ?? a.label).toLowerCase().includes(search.trim().toLowerCase())) return false
    if (tierFilter !== 'all' && a.current_rank?.tier !== tierFilter) return false
    if (divisionFilter !== 'all' && a.current_rank?.division !== divisionFilter) return false
    return true
  })

  const reserve = useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await supabase.rpc('reserve_duo_account', {
        p_order_id: order.id,
        p_account_id: accountId,
      })
      if (error) throw error
      const result = data as { success: boolean; error?: string }
      if (!result.success) throw new Error(result.error ?? 'Erro ao reservar conta')
    },
    onSuccess: () => {
      setSwitching(false)
      setAccessToken(null)
      queryClient.invalidateQueries({ queryKey: ['booster-duo-accounts', order.id] })
    },
  })

  const getToken = useMutation({
    mutationFn: async () => {
      if (!reserved) throw new Error('Nenhuma conta reservada')
      const { data, error } = await supabase.rpc('get_duo_account_access_token', { p_account_id: reserved.id })
      if (error) throw error
      const result = data as { success: boolean; access_token?: string; error?: string } | null
      if (!result?.success || !result.access_token) throw new Error(result?.error ?? 'Token indisponível')
      return result.access_token
    },
    onSuccess: (token) => setAccessToken(token),
  })

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

      {isLoading ? (
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
            <Button size="sm" variant="secondary" leftIcon={<RefreshCcw className="h-3.5 w-3.5" />} onClick={() => setSwitching(true)}>
              Trocar
            </Button>
          </div>

          {accessToken ? (
            <div className="space-y-2">
              <textarea
                readOnly
                value={accessToken}
                className="input-base w-full min-h-[80px] text-[11px] font-mono resize-none"
                spellCheck={false}
              />
              <Button
                size="sm"
                className="w-full"
                variant={tokenCopied ? 'success' : 'secondary'}
                leftIcon={<Copy className="h-3.5 w-3.5" />}
                onClick={() => void copyToken()}
              >
                {tokenCopied ? 'Copiado' : 'Copiar token'}
              </Button>
              <p className="text-[10px] text-ink-muted">Use este token apenas no aplicativo autorizado — login e senha não são exibidos.</p>
            </div>
          ) : (
            <Button
              size="sm"
              className="w-full"
              leftIcon={<KeyRound className="h-3.5 w-3.5" />}
              loading={getToken.isPending}
              onClick={() => getToken.mutate()}
            >
              Obter token de acesso
            </Button>
          )}
          {getToken.isError && (
            <ErrorAlert message={getToken.error instanceof Error ? getToken.error.message : 'Erro ao obter token'} />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nick..."
              className="input-base col-span-3 sm:col-span-1 text-xs"
            />
            <select
              value={tierFilter}
              onChange={(e) => { setTierFilter(e.target.value as RankTier | 'all'); setSelectedAccountId('') }}
              className="input-base text-xs"
            >
              <option value="all">Elo</option>
              {DUO_FILTER_TIERS.map((t) => <option key={t} value={t}>{RANK_TIER_LABEL[t]}</option>)}
            </select>
            <select
              value={divisionFilter}
              onChange={(e) => { setDivisionFilter(e.target.value as Division | 'all'); setSelectedAccountId('') }}
              className="input-base text-xs"
            >
              <option value="all">Divisão</option>
              {DUO_FILTER_DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {available.length === 0 ? (
            <p className="text-xs text-ink-muted py-2">Nenhuma conta Duo disponível com esse filtro.</p>
          ) : (
            <div className="max-h-52 space-y-1.5 overflow-y-auto pr-0.5">
              {available.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAccountId(a.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                    selectedAccountId === a.id
                      ? 'border-brand bg-brand/10'
                      : 'border-bg-elevated hover:bg-bg-elevated/60'
                  }`}
                >
                  {a.current_rank && (
                    <RankBadge tier={a.current_rank.tier} division={a.current_rank.division} size="xs" showLabel={false} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{a.riot_id ?? a.label}</p>
                    {a.current_rank && (
                      <p className="text-[10px] text-ink-muted">{RANK_TIER_LABEL[a.current_rank.tier]} {a.current_rank.division}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <Button
            size="sm"
            className="w-full"
            disabled={!selectedAccountId}
            loading={reserve.isPending}
            onClick={() => reserve.mutate(selectedAccountId)}
          >
            Reservar esta conta
          </Button>
          {switching && (
            <Button size="sm" variant="ghost" className="w-full" onClick={() => setSwitching(false)}>
              Cancelar
            </Button>
          )}
          {reserve.isError && (
            <ErrorAlert message={reserve.error instanceof Error ? reserveErrorMessage(reserve.error.message) : 'Erro ao reservar conta'} />
          )}
        </div>
      )}
    </Card>
  )
}
import { useCurrency } from '@/hooks/useCurrency'

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [dropReason, setDropReason] = useState('')
  const [showDropModal, setShowDropModal] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const { t } = useTranslation()
  const currency = useCurrency()

  const STATUS_ACTIONS: { from: OrderStatus[]; to: OrderStatus; label: string; icon: React.ElementType; variant: 'primary' | 'secondary' | 'success' | 'danger' }[] = [
    { from: ['assigned'], to: 'in_progress', label: t('booster.job.startOrder'), icon: Play, variant: 'primary' },
    { from: ['in_progress'], to: 'paused', label: t('booster.job.pause'), icon: Pause, variant: 'secondary' },
    { from: ['paused'], to: 'in_progress', label: t('booster.job.resume'), icon: Play, variant: 'primary' },
    { from: ['in_progress', 'paused'], to: 'awaiting_customer', label: t('booster.job.markComplete'), icon: CheckCircle2, variant: 'success' as const },
  ]

  const { data: order, isLoading: loadingOrder, isError: orderError, refetch: refetchOrder } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data: available, error: availableError } = await supabase
        .from('available_boost_orders')
        .select('*')
        .eq('id', id!)
        .maybeSingle()
      if (availableError) throw availableError
      if (available) return available as unknown as Order

      const { data, error } = await supabase.from('orders').select(ORDER_SAFE_COLUMNS).eq('id', id!).single()
      if (error) throw error
      return data as unknown as Order
    },
    enabled: !!id,
  })

  const { data: pendingDrop } = useQuery({
    queryKey: ['drop-request', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_drop_requests')
        .select('*')
        .eq('order_id', id!)
        .eq('status', 'pending')
        .maybeSingle()
      if (error) throw error
      return data as OrderDropRequest | null
    },
    enabled: !!id,
  })

  const updateStatus = useMutation({
    mutationFn: async (newStatus: OrderStatus) => {
      const { data, error } = await supabase.rpc('update_order_status', {
        p_order_id: id!,
        p_new_status: newStatus,
      })
      if (error) throw error
      const result = data as { success: boolean; error?: string }
      if (!result.success) throw new Error(result.error ?? 'Erro ao atualizar status')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
  })

  const syncMatches = useMutation({
    mutationFn: async () => {
      return invokeEdgeFunction<{ synced: boolean; reason?: string; new_matches?: number }>('sync-order-matches', {
        body: { order_id: id! },
        timeoutMs: 25_000,
        requireAuth: true,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['order-matches', id] })
    },
  })

  const verifyRank = useMutation({
    mutationFn: async () => {
      return invokeEdgeFunction<{
        passed: boolean
        reason?: string
        fetched_tier?: RankTier
        fetched_division?: Division | null
        target_tier?: RankTier
        target_division?: Division | null
      }>('verify-order-rank', {
        body: { order_id: id! },
        requireAuth: true,
      })
    },
    onSuccess: (result) => {
      if (result.passed) queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
  })

  const revealAccessToken = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('get_order_credentials', {
        p_order_id: id!,
      })
      if (error) throw error
      const result = data as { success: boolean; access_token?: string; error?: string } | null
      if (!result?.success || !result.access_token) {
        throw new Error(result?.error ?? 'Token de acesso indisponível')
      }
      return result.access_token
    },
    onSuccess: (token) => setAccessToken(token),
  })

  async function copyAccessToken() {
    if (!accessToken) return
    await navigator.clipboard.writeText(accessToken)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 1500)
  }

  const requestDrop = useMutation({
    mutationFn: async (reason: string) => {
      const { data, error } = await supabase.rpc('request_order_drop', {
        p_order_id: id!,
        p_reason: reason,
      })
      if (error) throw error
      const result = data as { success: boolean; penalty_pct?: number; penalty_amount?: number; error?: string }
      if (!result.success) throw new Error(result.error ?? 'Erro ao solicitar drop')
      return result
    },
    onSuccess: () => {
      setShowDropModal(false)
      setDropReason('')
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['drop-request', id] })
    },
  })

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

  const objectiveReached = order.wins_purchased == null || order.wins_played >= order.wins_purchased
  const availableActions = STATUS_ACTIONS.filter(a =>
    a.from.includes(order.status) && (a.to !== 'awaiting_customer' || objectiveReached)
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
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
          {/* Order info */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-4">{t('booster.job.details')}</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><p className="text-xs text-ink-muted">{t('booster.job.queue')}</p><p className="text-sm font-semibold text-ink">{order.queue_type === 'solo_duo' ? t('booster.job.soloQueue') : t('booster.job.flexQueue')}</p></div>
              {!order.pdl_bracket && (
                <div><p className="text-xs text-ink-muted">Modo</p><p className="text-sm font-semibold text-ink">{order.boost_mode === 'duo' ? 'Duo Boost' : 'Solo Boost'}</p></div>
              )}
              {order.pdl_bracket && (
                <>
                  <div><p className="text-xs text-ink-muted">PDL Atual</p><p className="text-sm font-semibold text-ink">{order.current_pdl ?? '—'} PDL</p></div>
                  <div><p className="text-xs text-ink-muted">Méd. Ganho/Perda</p><p className="text-sm font-semibold text-ink">+{order.avg_pdl_gain ?? '—'} / −{order.avg_pdl_loss ?? '—'} PDL</p></div>
                </>
              )}
              {order.current_rank && (
                <div>
                  <p className="text-xs text-ink-muted mb-1">{t('booster.job.from')}</p>
                  <div className="flex items-center gap-2">
                    <RankBadge
                      tier={(order.current_rank as { tier: RankTier }).tier}
                      division={(order.current_rank as { division: Division }).division}
                      size="sm"
                      showLabel={false}
                    />
                    <span className="text-sm font-semibold text-ink">
                      {formatRank((order.current_rank as { tier: RankTier }).tier, (order.current_rank as { division: Division }).division)}
                    </span>
                  </div>
                </div>
              )}
              {order.target_rank && (
                <div>
                  <p className="text-xs text-ink-muted mb-1">{t('booster.job.to')}</p>
                  <div className="flex items-center gap-2">
                    <RankBadge
                      tier={(order.target_rank as { tier: RankTier }).tier}
                      division={(order.target_rank as { division: Division }).division}
                      size="sm"
                      showLabel={false}
                    />
                    <span className="text-sm font-semibold text-ink">
                      {formatRank((order.target_rank as { tier: RankTier }).tier, (order.target_rank as { division: Division }).division)}
                    </span>
                  </div>
                </div>
              )}
            </div>
            {order.extras?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-ink-muted mb-1.5">Extras</p>
                <div className="flex flex-wrap gap-1.5">
                  {sortOrderExtras(order.extras).map((extra) => (
                    <span key={extra.extra_id} className="text-[11px] font-medium bg-bg-elevated text-ink-secondary px-2 py-1 rounded-lg">
                      {extra.name}
                    </span>
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
          </Card>

          <OrderChat orderId={order.id} viewerRole="booster" />
        </div>

        {/* Actions panel */}
        <div className="space-y-4">
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-3">{t('booster.job.earnings')}</h3>
            <p className="text-2xl font-bold text-success">{currency(order.total_price * BOOSTER_EARNINGS_SHARE)}</p>
            <p className="text-xs text-ink-muted mt-0.5">{t('booster.job.yourCutOf', { amount: currency(order.total_price) })}</p>
          </Card>

          {order.status === 'awaiting_customer' && (
            <Card padding="md" className="ring-1 ring-accent/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                <p className="text-sm text-ink-secondary">
                  Objetivo alcançado! Aguardando a confirmação final do cliente.
                </p>
              </div>
            </Card>
          )}

          {order.status === 'completed' && (
            <Card padding="md" className="ring-1 ring-success/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <p className="text-sm text-ink-secondary">
                  Serviço concluído! O cliente confirmou a entrega e seus ganhos foram liberados.
                </p>
              </div>
            </Card>
          )}

          {order.boost_mode === 'duo' && order.assigned_booster_id === profile?.id
            && ['assigned', 'in_progress', 'paused'].includes(order.status) && (
            <DuoAccountSection order={order} />
          )}

          {orderRequiresAccountAccess(order) && order.assigned_booster_id === profile?.id && (
            <Card padding="md">
              <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-brand" />
                Token de acesso
              </h3>
              <p className="text-xs text-ink-secondary mb-3">
                Use este token apenas no aplicativo autorizado para inicializar o client. Login e senha não são exibidos.
              </p>

              {!order.credentials_set ? (
                <div className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                  O cliente ainda não gerou o token de acesso.
                </div>
              ) : accessToken ? (
                <div className="space-y-2">
                  <textarea
                    readOnly
                    value={accessToken}
                    className="input-base w-full min-h-[96px] text-[11px] font-mono resize-none"
                    spellCheck={false}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    variant={tokenCopied ? 'success' : 'secondary'}
                    leftIcon={<Copy className="h-3.5 w-3.5" />}
                    onClick={() => void copyAccessToken()}
                  >
                    {tokenCopied ? 'Copiado' : 'Copiar token'}
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="w-full"
                  leftIcon={<KeyRound className="h-3.5 w-3.5" />}
                  loading={revealAccessToken.isPending}
                  onClick={() => revealAccessToken.mutate()}
                >
                  Mostrar token
                </Button>
              )}

              {revealAccessToken.isError && (
                <ErrorAlert
                  message={revealAccessToken.error instanceof Error ? revealAccessToken.error.message : 'Erro ao buscar token'}
                  className="mt-2"
                />
              )}
            </Card>
          )}

          <OrderProgress order={order} />

          {/* Sincronização automática de partidas */}
          {(order.status === 'in_progress' || order.status === 'paused') && (
            <Card padding="md">
              <h3 className="text-sm font-semibold text-ink mb-3">Sincronizar partidas</h3>
              <p className="text-xs text-ink-secondary mb-3">
                Os resultados são identificados automaticamente pela Riot Games — não é possível editar manualmente.
              </p>
              <Button
                className="w-full"
                variant="secondary"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                loading={syncMatches.isPending}
                onClick={() => syncMatches.mutate()}
              >
                Sincronizar partidas
              </Button>
              {syncMatches.isError && (
                <ErrorAlert
                  className="mt-2"
                  message={syncMatches.error instanceof Error ? syncMatches.error.message : 'Erro ao sincronizar partidas'}
                />
              )}
              {syncMatches.data && (
                <p className="text-xs text-ink-muted mt-2 text-center">
                  {syncMatches.data.synced
                    ? syncMatches.data.new_matches
                      ? `${syncMatches.data.new_matches} nova(s) partida(s) registrada(s).`
                      : 'Nenhuma partida nova encontrada.'
                    : 'Conta Riot não encontrada. Confira o Riot ID cadastrado no pedido.'}
                </p>
              )}
            </Card>
          )}

          {['in_progress', 'paused', 'awaiting_customer', 'completed'].includes(order.status) && (
            <OrderMatchHistory orderId={order.id} />
          )}

          {/* Verificação de rank — só pra pedidos com rank alvo + Riot ID
              cadastrados. Aprovado conclui o pedido automaticamente (via
              complete_verified_order no servidor); reprovado só mostra o
              motivo, sem mudar o status. */}
          {['in_progress', 'paused', 'awaiting_customer'].includes(order.status) && order.target_rank && order.riot_id && (
            <Card padding="md">
              <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand" />
                Verificação de Rank
              </h3>
              <p className="text-xs text-ink-secondary mb-3">
                Confirma automaticamente, via Riot Games, se a conta já atingiu o rank alvo. Se sim, o pedido é concluído.
              </p>
              <Button
                className="w-full"
                variant="success"
                leftIcon={<ShieldCheck className="h-4 w-4" />}
                loading={verifyRank.isPending}
                onClick={() => verifyRank.mutate()}
              >
                Verificar Rank e Concluir
              </Button>
              {verifyRank.isError && (
                <ErrorAlert
                  message={verifyRank.error instanceof Error ? verifyRank.error.message : 'Erro ao verificar rank'}
                  className="mt-2"
                />
              )}
              {verifyRank.data && !verifyRank.data.passed && (
                <div className="text-xs text-warning mt-2 bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                  {verifyRank.data.reason === 'account_not_found' && 'Conta Riot não encontrada. Confira o Riot ID cadastrado no pedido.'}
                  {verifyRank.data.reason === 'unranked' && 'A conta ainda não tem partidas ranqueadas solo/duo nesta temporada.'}
                  {verifyRank.data.reason === 'target_not_reached' && verifyRank.data.fetched_tier && (
                    <>
                      Rank atual verificado: <strong>{formatRank(verifyRank.data.fetched_tier, verifyRank.data.fetched_division ?? null)}</strong> —
                      alvo: <strong>{formatRank(verifyRank.data.target_tier!, verifyRank.data.target_division ?? null)}</strong>. Ainda não bateu.
                    </>
                  )}
                </div>
              )}
            </Card>
          )}

          {availableActions.length > 0 && (
            <Card padding="md">
              <h3 className="text-sm font-semibold text-ink mb-3">{t('booster.job.actions')}</h3>
              <div className="space-y-2">
                {availableActions.map(({ to, label, icon: Icon, variant }) => (
                  <Button
                    key={to}
                    variant={variant === 'success' ? 'success' : variant}
                    className="w-full"
                    leftIcon={<Icon className="h-4 w-4" />}
                    loading={updateStatus.isPending}
                    onClick={() => updateStatus.mutate(to)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {updateStatus.isError && (
                <ErrorAlert
                  className="mt-2"
                  message={
                    updateStatus.error instanceof Error && updateStatus.error.message === 'objective_not_reached'
                      ? 'Ainda faltam vitórias contratadas para marcar como concluído.'
                      : updateStatus.error instanceof Error ? updateStatus.error.message : 'Erro ao atualizar status'
                  }
                />
              )}
            </Card>
          )}

          {/* Drop request */}
          {order.status === 'in_progress' && !pendingDrop && (
            <Button
              variant="danger-ghost"
              className="w-full"
              leftIcon={<AlertTriangle className="h-4 w-4" />}
              onClick={() => setShowDropModal(true)}
            >
              Solicitar Drop
            </Button>
          )}

          {(order.status === 'drop_requested' || pendingDrop) && (
            <div className="card p-3 border border-warning/30 bg-warning/5">
              <div className="flex items-center gap-2 text-warning text-sm font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Solicitação de drop pendente
              </div>
              <p className="text-xs text-ink-secondary mt-1">Aguardando aprovação do admin.</p>
            </div>
          )}
        </div>
      </div>

      {/* Drop request modal */}
      <Modal
        open={showDropModal}
        onOpenChange={(open) => { if (!open) { setShowDropModal(false); setDropReason('') } }}
        title="Solicitar Drop de Pedido"
        description={
          <>
            Sua solicitação será enviada ao admin para aprovação. Com {order.wins_played} vitória(s), a penalidade é de{' '}
            <span className="font-bold text-warning">
              {order.wins_played === 0 ? '0%' : order.wins_played <= 2 ? '10%' : '20%'}
            </span>{' '}
            do valor do pedido.
          </>
        }
      >
        <div>
          <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
            Motivo <span className="text-danger">*</span>
          </label>
          <textarea
            value={dropReason}
            onChange={(e) => setDropReason(e.target.value)}
            placeholder="Descreva o motivo para abandonar o pedido..."
            className="input-base w-full min-h-[100px] resize-none text-sm"
          />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="ghost" onClick={() => { setShowDropModal(false); setDropReason('') }}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={requestDrop.isPending}
            disabled={dropReason.trim().length < 10}
            onClick={() => requestDrop.mutate(dropReason.trim())}
          >
            Enviar Solicitação
          </Button>
        </div>
      </Modal>
    </div>
  )
}
