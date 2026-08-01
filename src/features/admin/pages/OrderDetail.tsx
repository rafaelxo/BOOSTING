import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, History, Lock, RefreshCw, XOctagon, MessageCircleWarning,
  Gamepad2, Users, Shuffle, TrendingUp, Trophy, CalendarDays, Wallet, User,
} from 'lucide-react'
import { Button, Card, OrderStatusBadge, ErrorAlert, PageLoader, Modal } from '@/components/ui'
import { OrderChat } from '@/components/order/OrderChat'
import { useOrderChat } from '@/api/chat'
import { OrderMatchHistory } from '@/components/order/OrderMatchHistory'
import { OrderProgress } from '@/components/order/OrderProgress'
import { OrderTimeline } from '@/components/order/OrderTimeline'
import { CountdownTimer } from '@/components/order/CountdownTimer'
import { supabase } from '@/lib/supabase'
import { formatDateTime, timeAgo, getServiceLabel, PAYMENT_STATUS_LABEL, formatRank, sortOrderExtras } from '@/lib/utils'
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

// admin_override_order_status aceita qualquer status sem validar a transição
// (é a válvula de escape do admin) -- mas listar as 9 opções lado a lado sem
// contexto obriga o admin a saber de cor qual é o próximo passo certo. Aqui
// só a etapa seguinte natural do status atual aparece em destaque; o resto
// (disputa/reembolso/cancelamento) continua sempre disponível, só que
// separado como ação excepcional -- nenhuma capacidade foi removida.
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

export function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const currency = useCurrency()
  const [showDropModal, setShowDropModal] = useState(false)
  const [dropReason, setDropReason] = useState('')

  const { data: order, isLoading: loadingOrder, isError: orderError, refetch: refetchOrder } = useOrder(id)
  const { data: history } = useOrderStatusHistory(id)
  // Dispara a busca do chat em paralelo com o pedido, em vez de esperar
  // loadingOrder resolver pra só então montar <OrderChat> -- mesma query key
  // do hook interno dele, então o resultado já vem do cache quando ele monta.
  useOrderChat(id)

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
  const dropOrder = useAdminDropOrder(id ?? '')
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

  const hasRankRail = !!(order.target_rank && order.current_rank && !order.pdl_bracket)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar">
          <Link to="/admin/orders"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-ink">Pedido #{order.id.slice(0, 8).toUpperCase()}</h1>
            <OrderStatusBadge status={order.status} />
            {order.drop_count > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wide bg-warning/15 text-warning border border-warning/30">
                <History className="h-3 w-3" />
                Dropado {order.drop_count > 1 ? `${order.drop_count}x` : ''} · valor e prazo já atualizados
                {order.last_dropped_at ? ` · último drop ${timeAgo(order.last_dropped_at)}` : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted mt-0.5">Criado em {formatDateTime(order.created_at)}</p>
        </div>
        {['in_progress', 'paused', 'awaiting_customer'].includes(order.status) && (
          <CountdownTimer startedAt={order.match_sync_started_at} estimatedHours={order.estimated_hours} />
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card padding="md">
            <OrderProgress order={order} />
            <h3 className="text-sm font-semibold text-ink mb-4">Detalhes do Pedido</h3>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  [User, 'Cliente', parties?.customerUsername ?? '…'],
                  [Gamepad2, 'Serviço', getServiceLabel(order.service_type)],
                  ...(order.service_type === 'elo_boost' || order.service_type === 'win_boost' || order.service_type === 'md5'
                    ? [[Users, 'Fila', order.queue_type === 'solo_duo' ? 'Solo/Duo' : 'Flex']]
                    : []),
                  ...(order.service_type === 'elo_boost' && !order.pdl_bracket
                    ? [[Shuffle, 'Modo', order.boost_mode === 'duo' ? 'Duo Boost' : 'Solo Boost']]
                    : []),
                  ...(!hasRankRail && order.current_rank ? [[TrendingUp, 'Rank Atual', (
                    order.drop_count > 0 && order.rank_before_last_drop
                      ? `${formatRank((order.rank_before_last_drop as { tier: string }).tier as never, (order.rank_before_last_drop as { division: string }).division)} → ${formatRank((order.current_rank as { tier: string }).tier as never, (order.current_rank as { division: string }).division)}`
                      : formatRank((order.current_rank as { tier: string }).tier as never, (order.current_rank as { division: string }).division)
                  )]] : []),
                  ...(!hasRankRail && order.service_type === 'elo_boost' && order.target_rank
                    ? [[TrendingUp, 'Rank Alvo', formatRank((order.target_rank as { tier: string }).tier as never, (order.target_rank as { division: string }).division)]]
                    : []),
                  ...(order.pdl_bracket ? [
                    [TrendingUp, 'PDL Atual', `${order.current_pdl ?? '—'} PDL (faixa ${order.pdl_bracket})`],
                    [TrendingUp, 'Méd. PDL Ganho/Vitória', order.avg_pdl_gain != null ? `+${order.avg_pdl_gain} PDL` : '—'],
                    [TrendingUp, 'Méd. PDL Perdido/Derrota', order.avg_pdl_loss != null ? `−${order.avg_pdl_loss} PDL` : '—'],
                  ] : []),
                  ...((order.service_type === 'win_boost' || order.service_type === 'md5') && order.wins_purchased
                    ? [[Trophy, 'Vitórias Compradas', `${order.wins_purchased}`]]
                    : []),
                  ...(order.service_type === 'coaching' && order.sessions_purchased
                    ? [[CalendarDays, 'Sessões', `${order.sessions_purchased}`]]
                    : []),
                  ...(order.service_type === 'clash' && order.clash_tier
                    ? [[TrendingUp, `${CLASH_TIER_LABEL[order.clash_tier]} (${CLASH_TIER_RANGE_LABEL[order.clash_tier]})`, order.clash_day ? CLASH_DAY_LABEL[order.clash_day] : '—']]
                    : []),
                  ...(order.service_type === 'clash' && order.boost_mode === 'duo'
                    ? [[User, 'Conta Duo', reservedDuoAccount ? reservedDuoAccount.label : 'Não reservada']]
                    : []),
                  [Wallet, 'Base', currency(order.base_price)],
                  [Wallet, 'Extras', currency(order.extras_price)],
                  [Wallet, 'Total', currency(order.total_price)],
                  [
                    User,
                    'Booster',
                    order.assigned_booster_id
                      ? <BoosterLink userId={order.assigned_booster_id} booster={parties?.boosterByUserId.get(order.assigned_booster_id)} />
                      : 'Não atribuído',
                  ],
                  ...(order.preferred_booster_id ? [[
                    User,
                    'Pedido direto',
                    <span key="preferred-booster" className="inline-flex items-center gap-1">
                      <BoosterLink userId={order.preferred_booster_id} booster={parties?.boosterByUserId.get(order.preferred_booster_id)} />
                      {order.exclusive_until && new Date(order.exclusive_until) > new Date()
                        ? ` (exclusivo até ${new Date(order.exclusive_until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})`
                        : ' (exclusividade expirada)'}
                    </span>,
                  ]] : []),
                  [Wallet, 'Pag.', order.payment_status ? PAYMENT_STATUS_LABEL[order.payment_status] : '—'],
                ] as [React.ElementType, string, React.ReactNode][]
              ).map(([Icon, l, v]) => (
                <div key={l as string}>
                  <p className="text-xs text-ink-muted flex items-center gap-1"><Icon className="h-3 w-3 shrink-0" />{l as string}</p>
                  <p className="text-sm font-semibold text-ink" data-tabular>{v}</p>
                </div>
              ))}
            </div>

            {order.extras?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border-subtle">
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
          </Card>

          {['assigned', 'in_progress', 'paused', 'awaiting_customer', 'drop_requested', 'completed'].includes(order.status) && (
            <OrderMatchHistory
              orderId={order.id}
              sync={order.status === 'in_progress' || order.status === 'paused' ? {
                onSync: () => syncMatches.mutate(),
                syncing: syncMatches.isPending,
                error: syncMatches.isError ? (syncMatches.error instanceof Error ? syncMatches.error.message : 'Erro ao sincronizar partidas') : null,
                resultMessage: syncMatches.data
                  ? (syncMatches.data.synced
                    ? (syncMatches.data.new_matches ? `${syncMatches.data.new_matches} nova(s) partida(s) registrada(s).` : 'Nenhuma partida nova encontrada.')
                    : 'Conta Riot não encontrada. Confira o Riot ID cadastrado no pedido.')
                  : null,
              } : undefined}
            />
          )}
        </div>

        <div className="space-y-4">
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

          {DROPPABLE_STATUSES.includes(order.status) && (
            <Card padding="md">
              <h3 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
                <XOctagon className="h-4 w-4 text-danger" />
                Dropar Pedido
              </h3>
              <p className="text-xs text-ink-muted mb-3">Retira o booster e reabre o pedido pra outro assumir. Ele recebe proporcional ao quanto já concluiu do pedido (0% concluído = nada recebido, preço integral pro próximo booster; conforme a % de conclusão sobe, o pagamento sobe e o preço restante desce na mesma proporção).</p>
              <Button variant="danger" size="sm" className="w-full" onClick={() => setShowDropModal(true)}>
                Dropar Pedido
              </Button>
            </Card>
          )}

          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-ink-secondary" />
              Alterar Status
            </h3>

            {!!FORWARD_STATUS[order.status]?.length && (
              <div className="space-y-1.5 mb-3">
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
            <div className="space-y-1.5">
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

          <OrderChat orderId={order.id} viewerRole="admin" orderStatus={order.status} />

          <OrderTimeline history={history} />
        </div>
      </div>

      <Modal
        open={showDropModal}
        onOpenChange={(open) => { if (!open) { setShowDropModal(false); setDropReason('') } }}
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
          <Button variant="ghost" onClick={() => { setShowDropModal(false); setDropReason('') }}>Cancelar</Button>
          <Button
            variant="danger"
            loading={dropOrder.isPending}
            disabled={dropReason.trim().length < 10}
            onClick={() => dropOrder.mutate(dropReason.trim(), { onSuccess: () => { setShowDropModal(false); setDropReason('') } })}
          >
            Confirmar Drop
          </Button>
        </div>
      </Modal>
    </div>
  )
}
