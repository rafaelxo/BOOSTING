import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  History, Lock, RefreshCw, MessageCircleWarning,
  Gamepad2, Users, Shuffle, Trophy, CalendarDays, Wallet, User, Hash, Copy, Check, Clock, CreditCard,
} from 'lucide-react'
import { Button, Card, OrderStatusBadge, ErrorAlert, PageLoader, Modal } from '@/components/ui'
import { OrderActionBar } from '@/components/order/OrderActionBar'
import { OrderInfoGrid, type OrderInfoGridItem } from '@/components/order/OrderInfoGrid'
import { OrderChatModal } from '@/components/order/OrderChatModal'
import { useOrderChat } from '@/api/chat'
import { OrderMatchHistory } from '@/components/order/OrderMatchHistory'
import { OrderProgress } from '@/components/order/OrderProgress'
import { OrderRankSummary } from '@/components/order/OrderRankSummary'
import { OrderTimeline } from '@/components/order/OrderTimeline'
import { CountdownTimer } from '@/components/order/CountdownTimer'
import { supabase } from '@/lib/supabase'
import { formatDateTime, timeAgo, getServiceLabel, PAYMENT_STATUS_LABEL, formatEstimatedDelivery, sortOrderExtras } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { useOrder, useOrderStatusHistory, useAdminOverrideOrderStatus, useAdminDropOrder, useSyncOrderMatches } from '@/api/orders'
import { useOrderSupportEscalation, useAdminResolveOrderSupport } from '@/api/admin'
import { useAdminDuoAccounts } from '@/api/duoAccounts'
import { CLASH_TIER_LABEL, CLASH_TIER_RANGE_LABEL, CLASH_DAY_LABEL } from '@/lib/clashDomain'
import type { OrderStatus } from '@/types'

type BoosterRef = { id: string; user_id: string; display_name: string } | undefined

function BoosterLink({ userId, booster }: { userId: string; booster: BoosterRef }) {
  if (!booster) return <span className="font-mono text-xs">{userId.slice(0, 8)}…</span>
  return (
    <Link to={`/admin/boosters/${booster.id}`} className="text-brand hover:underline">
      {booster.display_name}
    </Link>
  )
}

// Mesmo conjunto de status aceitos por admin_drop_order (migration 071) —
// 'drop_requested' fica de fora porque já tem sua própria fila em /admin/drops.
const DROPPABLE_STATUSES: OrderStatus[] = ['assigned', 'in_progress', 'paused', 'awaiting_customer']

const FORWARD_STATUS: Partial<Record<OrderStatus, { value: OrderStatus; label: string }[]>> = {
  awaiting_assignment: [{ value: 'assigned', label: 'Marcar como atribuído' }],
  assigned: [{ value: 'in_progress', label: 'Iniciar pedido' }],
  in_progress: [{ value: 'awaiting_customer', label: 'Marcar objetivo alcançado' }],
  awaiting_customer: [{ value: 'completed', label: 'Confirmar conclusão' }],
  disputed: [
    { value: 'in_progress', label: 'Reabrir pedido' },
    { value: 'completed', label: 'Confirmar conclusão' },
  ],
}

const EXCEPTIONAL_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'disputed', label: 'Marcar como disputado' },
  { value: 'refunded', label: 'Marcar como reembolsado' },
  { value: 'canceled', label: 'Cancelar pedido' },
]

function SupportEscalationCard({ orderId }: { orderId: string }) {
  const { data: escalation } = useOrderSupportEscalation(orderId)
  const resolve = useAdminResolveOrderSupport()

  if (!escalation) return null

  return (
    <Card padding="md" className="ring-1 ring-danger/25 bg-danger/5">
      <h3 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
        <MessageCircleWarning className="h-4 w-4 text-danger" />
        Suporte acionado pelo cliente
      </h3>
      <p className="text-xs text-ink-secondary">
        Atraso de {escalation.delay_minutes} minuto{escalation.delay_minutes === 1 ? '' : 's'} · acionado {timeAgo(escalation.requested_at)}
      </p>
      <Button size="sm" variant="secondary" className="mt-3 w-full" loading={resolve.isPending} onClick={() => resolve.mutate(escalation.id)}>
        Marcar como resolvido
      </Button>
    </Card>
  )
}

function AdminDropModal({ orderId, open, onClose }: { orderId: string; open: boolean; onClose: () => void }) {
  const [dropReason, setDropReason] = useState('')
  const dropOrder = useAdminDropOrder(orderId)

  return (
    <Modal
      open={open}
      onOpenChange={(next) => { if (!next) { onClose(); setDropReason('') } }}
      title="Dropar Pedido"
      description="O booster é retirado e o pedido volta pro painel de jobs disponíveis. O pagamento parcial é proporcional ao quanto ele já concluiu do pedido."
    >
      <div>
        <label className="text-xs font-semibold text-ink-secondary block mb-1.5">Motivo (mín. 10 caracteres)</label>
        <textarea value={dropReason} onChange={(e) => setDropReason(e.target.value)} placeholder="Justificativa para o drop..." className="input-base w-full min-h-[80px] resize-none text-sm" maxLength={500} />
      </div>
      {dropOrder.isError && (
        <ErrorAlert message={dropOrder.error instanceof Error ? dropOrder.error.message : 'Erro'} className="mt-2" />
      )}
      <div className="flex gap-3 justify-end pt-2">
        <Button variant="ghost" onClick={() => { onClose(); setDropReason('') }}>Cancelar</Button>
        <Button
          variant="danger"
          loading={dropOrder.isPending}
          disabled={dropReason.trim().length < 10}
          onClick={() => dropOrder.mutate(dropReason.trim(), { onSuccess: () => { onClose(); setDropReason('') } })}
        >
          Confirmar Drop
        </Button>
      </div>
    </Modal>
  )
}

export function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const currency = useCurrency()
  const [dropModalOpen, setDropModalOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [nickCopied, setNickCopied] = useState(false)
  const [showStatusPanel, setShowStatusPanel] = useState(false)

  const { data: order, isLoading: loadingOrder, isError: orderError, refetch: refetchOrder } = useOrder(id)
  const { data: history } = useOrderStatusHistory(id)
  const chat = useOrderChat(id)

  const { data: parties } = useQuery({
    queryKey: ['admin', 'order-parties', order?.customer_id, order?.assigned_booster_id, order?.preferred_booster_id],
    queryFn: async () => {
      const boosterUserIds = [order!.assigned_booster_id, order!.preferred_booster_id].filter((v): v is string => !!v)
      const [{ data: customer }, { data: boosters }] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', order!.customer_id).maybeSingle(),
        boosterUserIds.length
          ? supabase.from('booster_profiles').select('id, user_id, display_name').in('user_id', boosterUserIds)
          : Promise.resolve({ data: [] as { id: string; user_id: string; display_name: string }[] }),
      ])
      return {
        customerUsername: customer?.username ?? null,
        boosterByUserId: new Map((boosters ?? []).map((b) => [b.user_id, b])),
      }
    },
    enabled: !!order,
  })

  const { data: allDuoAccounts } = useAdminDuoAccounts()
  const reservedDuoAccount = allDuoAccounts?.find((a) => a.reserved_order_id === order?.id)

  const updateStatus = useAdminOverrideOrderStatus(id ?? '')
  const syncMatches = useSyncOrderMatches(id ?? '')

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

  const isBoostFlow = order.service_type === 'elo_boost' || order.service_type === 'win_boost' || order.service_type === 'md5'
  const modeLabel = order.service_type === 'elo_boost'
    ? (order.boost_mode === 'duo' ? 'Duo Boost' : 'Solo Boost')
    : order.service_type === 'md5' ? 'MD5'
    : order.service_type === 'win_boost' ? 'Vitórias'
    : getServiceLabel(order.service_type)

  async function copyNickname() {
    if (!order?.riot_id) return
    await navigator.clipboard.writeText(order.riot_id)
    setNickCopied(true)
    setTimeout(() => setNickCopied(false), 1500)
  }

  const dropVisible = DROPPABLE_STATUSES.includes(order.status)
  const dropLimitReached = order.drop_count >= 2

  const infoItems: OrderInfoGridItem[] = [
    { icon: User, label: 'Nome do cliente', value: parties?.customerUsername ?? 'Carregando…' },
    ...(isBoostFlow ? [{ icon: Shuffle, label: 'Modo do pedido', value: modeLabel }] : []),
    ...(isBoostFlow ? [{ icon: Users, label: 'Fila', value: order.queue_type === 'solo_duo' ? 'Solo/Duo' : 'Flex' }] : []),
    ...((isBoostFlow || order.service_type === 'clash') ? [{
      icon: Hash, label: 'Riot ID', value: order.riot_id ? (
        <span className="inline-flex items-center justify-center gap-1.5">
          {order.riot_id}
          <button type="button" onClick={() => void copyNickname()} aria-label="Copiar Riot ID" className="text-ink-muted hover:text-brand transition-colors">
            {nickCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </span>
      ) : 'Não informado',
    }] : []),
    { icon: Clock, label: 'Entrega estimada', value: order.estimated_hours ? formatEstimatedDelivery(order.estimated_hours) : 'Não disponível' },
    {
      icon: User, label: 'Booster associado', value: order.assigned_booster_id
        ? <BoosterLink userId={order.assigned_booster_id} booster={parties?.boosterByUserId.get(order.assigned_booster_id)} />
        : 'Não associado',
    },
    ...((order.service_type === 'win_boost' || order.service_type === 'md5') && order.wins_purchased
      ? [{ icon: Trophy, label: 'Vitórias Compradas', value: `${order.wins_purchased}` }]
      : []),
    ...(order.service_type === 'coaching' && order.sessions_purchased
      ? [{ icon: CalendarDays, label: 'Sessões', value: `${order.sessions_purchased}` }]
      : []),
    ...(order.service_type === 'clash' && order.boost_mode === 'duo'
      ? [{ icon: Gamepad2, label: 'Conta Duo', value: reservedDuoAccount ? reservedDuoAccount.label : 'Não reservada' }]
      : []),
    { icon: Wallet, label: 'Total pago', value: currency(order.total_price) },
    { icon: CreditCard, label: 'Situação do pagamento', value: order.payment_status ? PAYMENT_STATUS_LABEL[order.payment_status] : 'Não disponível' },
  ]

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Card padding="lg" className="space-y-6">
        <OrderActionBar
          backHref="/admin/orders"
          onDrop={dropVisible ? () => setDropModalOpen(true) : undefined}
          dropDisabled={dropLimitReached}
          dropTooltip="Limite de drops atingido."
          onChat={() => setChatOpen(true)}
          chatUnavailable={chat.data ? !chat.data.chat_available : true}
          primary={(
            <Button variant="secondary" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => setShowStatusPanel((v) => !v)}>
              Alterar status
            </Button>
          )}
        />

        <div className="text-center">
          <h1 className="text-2xl font-bold text-ink">Pedido #{order.id.slice(0, 8).toUpperCase()}</h1>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            <OrderStatusBadge status={order.status} />
            {order.drop_count > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wide bg-warning/15 text-warning border border-warning/30">
                <History className="h-3 w-3" />
                Dropado {order.drop_count > 1 ? `${order.drop_count}x` : ''} · valor e prazo já atualizados
                {order.last_dropped_at ? ` · último drop ${timeAgo(order.last_dropped_at)}` : ''}
              </span>
            )}
            {['in_progress', 'paused', 'awaiting_customer'].includes(order.status) && (
              <CountdownTimer startedAt={order.match_sync_started_at} estimatedHours={order.estimated_hours} />
            )}
          </div>
          <p className="text-xs text-ink-muted mt-1">Criado em {formatDateTime(order.created_at)}</p>
        </div>

        {order.status === 'drop_requested' && (
          <Card padding="md" className="border border-warning/30 bg-warning/5">
            <h3 className="text-sm font-semibold text-warning mb-1 flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Pedido travado · aguardando análise
            </h3>
            <p className="text-xs text-ink-secondary mb-3">
              Existe uma solicitação de drop pendente pra este pedido. Nenhuma nova ação de boost
              acontece (credenciais, tokens e sincronização de partidas ficam bloqueados) até você
              aprovar ou rejeitar — chat e histórico continuam disponíveis normalmente.
            </p>
            <Button asChild size="sm" className="w-full">
              <Link to="/admin/drops">Analisar solicitação</Link>
            </Button>
          </Card>
        )}

        <SupportEscalationCard orderId={order.id} />

        {showStatusPanel && (
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-ink-secondary" />
              Alterar Status
            </h3>

            {!!FORWARD_STATUS[order.status]?.length && (
              <div className="space-y-1.5 mb-3 max-w-md">
                {FORWARD_STATUS[order.status]!.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => updateStatus.mutate({ orderId: order.id, newStatus: value })}
                    disabled={updateStatus.isPending}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold bg-brand/10 text-brand hover:bg-brand/15 transition-colors disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted mb-1.5">Ações excepcionais</p>
            <div className="space-y-1.5 max-w-md">
              {EXCEPTIONAL_STATUS_OPTIONS.filter(({ value }) => value !== order.status).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => updateStatus.mutate({ orderId: order.id, newStatus: value })}
                  disabled={updateStatus.isPending}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-ink-secondary hover:bg-bg-elevated hover:text-ink transition-colors disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
            {updateStatus.isError && (
              <ErrorAlert message={updateStatus.error instanceof Error ? updateStatus.error.message : 'Erro'} className="mt-2" />
            )}
          </Card>
        )}

        {/* Detalhes do pedido */}
        <div>
          <h3 className="text-sm font-semibold text-ink mb-4 text-center">Detalhes do pedido</h3>

          {order.service_type === 'clash' && order.clash_tier && (
            <div className="mb-4 pb-4 border-b border-border-subtle text-center">
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-ink-muted">
                <span>{CLASH_TIER_LABEL[order.clash_tier]}: <span className="font-semibold text-ink">{CLASH_TIER_RANGE_LABEL[order.clash_tier]}</span></span>
                {order.clash_day && <span>Dia: <span className="font-semibold text-ink">{CLASH_DAY_LABEL[order.clash_day]}</span></span>}
              </div>
            </div>
          )}

          <OrderRankSummary order={order} />
          <OrderProgress order={order} />

          <OrderInfoGrid items={infoItems} />

          {order.extras?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border-subtle max-w-md mx-auto">
              <p className="text-xs text-ink-muted mb-2">Extras selecionados</p>
              <div className="space-y-1.5">
                {sortOrderExtras(order.extras).map((extra) => (
                  <div key={extra.extra_id} className="flex items-center justify-between text-sm">
                    <span className="text-ink-secondary">{extra.name}{extra.code ? ` (${extra.code})` : ''}</span>
                    <span className="font-semibold text-ink" data-tabular>{currency(extra.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Histórico de partidas */}
        {['assigned', 'in_progress', 'paused', 'awaiting_customer', 'drop_requested', 'completed'].includes(order.status) && (
          <div className="border-t border-border-subtle pt-5">
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
          </div>
        )}

        <div className="border-t border-border-subtle pt-5">
          <OrderTimeline history={history} />
        </div>
      </Card>

      <OrderChatModal
        open={chatOpen}
        onOpenChange={setChatOpen}
        orderId={order.id}
        viewerRole="admin"
        orderStatus={order.status}
        orderShortId={order.id.slice(0, 8).toUpperCase()}
      />

      <AdminDropModal orderId={order.id} open={dropModalOpen} onClose={() => setDropModalOpen(false)} />
    </div>
  )
}
