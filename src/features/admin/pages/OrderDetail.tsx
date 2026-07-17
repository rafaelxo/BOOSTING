import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw, Clock, ShieldCheck, XOctagon } from 'lucide-react'
import { Button, Card, OrderStatusBadge, ErrorAlert, PageLoader, Modal } from '@/components/ui'
import { OrderChat } from '@/components/order/OrderChat'
import { supabase } from '@/lib/supabase'
import { ORDER_SAFE_COLUMNS } from '@/lib/orderColumns'
import { formatDateTime, timeAgo, getServiceLabel, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, formatRank, sortOrderExtras } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import type { Order, OrderStatus, OrderStatusHistory, OrderRankVerification } from '@/types'

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

const ADMIN_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'awaiting_assignment', label: 'Esperando Booster' },
  { value: 'assigned',            label: 'Booster Atribuído' },
  { value: 'in_progress',        label: 'Em Andamento' },
  { value: 'paused',             label: 'Pausado' },
  { value: 'awaiting_customer',  label: 'Aguardando Cliente' },
  { value: 'completed',          label: 'Concluído' },
  { value: 'disputed',           label: 'Disputado' },
  { value: 'refunded',           label: 'Reembolsado' },
  { value: 'canceled',           label: 'Cancelado' },
]

export function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const currency = useCurrency()
  const [showDropModal, setShowDropModal] = useState(false)
  const [dropReason, setDropReason] = useState('')

  const { data: order, isLoading: loadingOrder, isError: orderError, refetch: refetchOrder } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select(ORDER_SAFE_COLUMNS).eq('id', id!).single()
      if (error) throw error
      return data as unknown as Order
    },
    enabled: !!id,
    refetchInterval: 15000,
  })

  const { data: history } = useQuery({
    queryKey: ['admin-order-history', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_status_history')
        .select('*')
        .eq('order_id', id!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as OrderStatusHistory[]
    },
    enabled: !!id,
  })

  // Nomes legíveis pro cliente e pros boosters do pedido — trocamos os UUIDs
  // crus (que só um dev consegue ler) por username/display_name.
  const { data: parties } = useQuery({
    queryKey: ['admin-order-parties', order?.customer_id, order?.assigned_booster_id, order?.preferred_booster_id],
    queryFn: async () => {
      const boosterUserIds = [order!.assigned_booster_id, order!.preferred_booster_id]
        .filter((v): v is string => !!v)

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

  const { data: rankVerifications } = useQuery({
    queryKey: ['admin-order-rank-verifications', id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('order_rank_verifications')
        .select('*')
        .eq('order_id', id!)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data as OrderRankVerification[]
    },
    enabled: !!id,
  })

  const updateStatus = useMutation({
    mutationFn: async (newStatus: OrderStatus) => {
      const { data, error } = await supabase.rpc('admin_override_order_status', {
        p_order_id: id!,
        p_new_status: newStatus,
      })
      if (error) throw error
      const result = data as { success: boolean; error?: string }
      if (!result.success) throw new Error(result.error ?? 'Erro ao atualizar status')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-order', id] })
      queryClient.invalidateQueries({ queryKey: ['admin-order-history', id] })
    },
  })

  const dropOrder = useMutation({
    mutationFn: async (reason: string) => {
      const { data, error } = await supabase.rpc('admin_drop_order', {
        p_order_id: id!,
        p_reason: reason,
      })
      if (error) throw error
      const result = data as { success: boolean; error?: string }
      if (!result.success) throw new Error(result.error ?? 'Erro ao dropar pedido')
    },
    onSuccess: () => {
      setShowDropModal(false)
      setDropReason('')
      queryClient.invalidateQueries({ queryKey: ['admin-order', id] })
      queryClient.invalidateQueries({ queryKey: ['admin-order-history', id] })
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/admin/orders"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-ink">Pedido #{order.id.slice(0, 8).toUpperCase()}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-xs text-ink-muted mt-0.5">Criado em {formatDateTime(order.created_at)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Main — detalhes + chat */}
        <div className="lg:col-span-2 space-y-5">
          {/* Detalhes */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-4">Detalhes do Pedido</h3>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['Cliente', parties?.customerUsername ?? '…'],
                  ['Serviço', getServiceLabel(order.service_type)],
                  ...(order.service_type === 'elo_boost' || order.service_type === 'win_boost' || order.service_type === 'md5'
                    ? [['Fila', order.queue_type === 'solo_duo' ? 'Solo/Duo' : 'Flex']]
                    : []),
                  ...(order.service_type === 'elo_boost' && !order.pdl_bracket
                    ? [['Modo', order.boost_mode === 'duo' ? 'Duo Boost' : 'Solo Boost']]
                    : []),
                  ...(order.current_rank ? [['Rank Atual', formatRank((order.current_rank as { tier: string }).tier as never, (order.current_rank as { division: string }).division)]] : []),
                  ...(order.service_type === 'elo_boost' && order.target_rank
                    ? [['Rank Alvo', formatRank((order.target_rank as { tier: string }).tier as never, (order.target_rank as { division: string }).division)]]
                    : []),
                  ...(order.pdl_bracket ? [
                    ['PDL Atual', `${order.current_pdl ?? '—'} PDL (faixa ${order.pdl_bracket})`],
                    ['Méd. PDL Ganho/Vitória', order.avg_pdl_gain != null ? `+${order.avg_pdl_gain} PDL` : '—'],
                    ['Méd. PDL Perdido/Derrota', order.avg_pdl_loss != null ? `−${order.avg_pdl_loss} PDL` : '—'],
                  ] : []),
                  ...((order.service_type === 'win_boost' || order.service_type === 'md5') && order.wins_purchased
                    ? [['Vitórias Compradas', `${order.wins_purchased}`]]
                    : []),
                  ...(order.service_type === 'coaching' && order.sessions_purchased
                    ? [['Sessões', `${order.sessions_purchased}`]]
                    : []),
                  ['Base', currency(order.base_price)],
                  ['Extras', currency(order.extras_price)],
                  ['Total', currency(order.total_price)],
                  [
                    'Booster',
                    order.assigned_booster_id
                      ? <BoosterLink userId={order.assigned_booster_id} booster={parties?.boosterByUserId.get(order.assigned_booster_id)} />
                      : 'Não atribuído',
                  ],
                  ...(order.preferred_booster_id ? [[
                    'Pedido direto',
                    <span key="preferred-booster" className="inline-flex items-center gap-1">
                      <BoosterLink userId={order.preferred_booster_id} booster={parties?.boosterByUserId.get(order.preferred_booster_id)} />
                      {order.exclusive_until && new Date(order.exclusive_until) > new Date()
                        ? ` (exclusivo até ${new Date(order.exclusive_until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})`
                        : ' (exclusividade expirada)'}
                    </span>,
                  ]] : []),
                  ['Pag.', order.payment_status ? PAYMENT_STATUS_LABEL[order.payment_status] : '—'],
                ] as [string, React.ReactNode][]
              ).map(([l, v]) => (
                <div key={l as string}>
                  <p className="text-xs text-ink-muted">{l as string}</p>
                  <p className="text-sm font-semibold text-ink">{v}</p>
                </div>
              ))}
            </div>

            {order.extras?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-bg-elevated">
                <p className="text-xs text-ink-muted mb-2">Extras selecionados</p>
                <div className="space-y-1.5">
                  {sortOrderExtras(order.extras).map((extra) => (
                    <div key={extra.extra_id} className="flex items-center justify-between text-sm">
                      <span className="text-ink-secondary">{extra.name}{extra.code ? ` (${extra.code})` : ''}</span>
                      <span className="font-semibold text-ink">{currency(extra.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <OrderChat orderId={order.id} viewerRole="admin" />
        </div>

        {/* Sidebar — controles + histórico */}
        <div className="space-y-4">
          {/* Alterar status */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-ink-secondary" />
              Alterar Status
            </h3>
            <div className="space-y-1.5">
              {ADMIN_STATUS_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => updateStatus.mutate(value)}
                  disabled={order.status === value || updateStatus.isPending}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    order.status === value
                      ? 'bg-brand/10 text-brand cursor-default'
                      : 'text-ink-secondary hover:bg-bg-elevated hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {updateStatus.isError && (
              <ErrorAlert
                message={updateStatus.error instanceof Error ? updateStatus.error.message : 'Erro'}
                className="mt-2"
              />
            )}
          </Card>

          {/* Histórico de status */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-ink-secondary" />
              Histórico de Status
            </h3>
            {!history?.length ? (
              <p className="text-xs text-ink-muted">Sem histórico.</p>
            ) : (
              <div className="space-y-3">
                {history.map((entry) => (
                  <div key={entry.id} className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-ink-muted mt-1.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-ink">
                        {ORDER_STATUS_LABEL[entry.to_status] ?? entry.to_status}
                      </p>
                      <p className="text-[10px] text-ink-muted">{timeAgo(entry.created_at)}</p>
                      {entry.reason && (
                        <p className="text-[10px] text-ink-secondary mt-0.5">{entry.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Verificações de rank — histórico do que a Riot API já
              confirmou (ou não), pra decidir com contexto antes de usar a
              sobreposição manual de status abaixo. */}
          {!!rankVerifications?.length && (
            <Card padding="md">
              <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-ink-secondary" />
                Verificações de Rank
              </h3>
              <div className="space-y-3">
                {rankVerifications.map((v) => (
                  <div key={v.id} className="flex gap-2">
                    <div className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${v.passed ? 'bg-success' : 'bg-warning'}`} />
                    <div>
                      <p className="text-xs font-semibold text-ink">
                        {v.riot_id_checked} — {v.passed ? 'Aprovado' : 'Não bateu'}
                        {v.fetched_tier && ` (${formatRank(v.fetched_tier, v.fetched_division)} / alvo ${formatRank(v.target_tier, v.target_division)})`}
                      </p>
                      <p className="text-[10px] text-ink-muted">{timeAgo(v.created_at)}{v.error_reason ? ` · ${v.error_reason}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Booster */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-2">Booster</h3>
            <p className="text-xs text-ink-secondary">
              {order.assigned_booster_id
                ? <BoosterLink userId={order.assigned_booster_id} booster={parties?.boosterByUserId.get(order.assigned_booster_id)} />
                : 'Nenhum booster atribuído.'}
            </p>
          </Card>

          {/* Dropar pedido — cancela na hora, sem penalidade pro booster
              (diferente do drop pedido pelo próprio booster, que passa pela
              fila de /admin/drops). */}
          {DROPPABLE_STATUSES.includes(order.status) && (
            <Card padding="md">
              <h3 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
                <XOctagon className="h-4 w-4 text-danger" />
                Dropar Pedido
              </h3>
              <p className="text-xs text-ink-muted mb-3">
                Cancela o pedido imediatamente. Não aplica penalidade ao booster.
              </p>
              <Button
                variant="danger"
                size="sm"
                className="w-full"
                onClick={() => setShowDropModal(true)}
              >
                Dropar Pedido
              </Button>
            </Card>
          )}
        </div>
      </div>

      {/* Drop modal */}
      <Modal
        open={showDropModal}
        onOpenChange={(open) => { if (!open) { setShowDropModal(false); setDropReason('') } }}
        title="Dropar Pedido"
        description="O pedido será cancelado imediatamente. Nenhuma penalidade é aplicada ao booster."
      >
        <div>
          <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
            Motivo (mín. 10 caracteres)
          </label>
          <textarea
            value={dropReason}
            onChange={(e) => setDropReason(e.target.value)}
            placeholder="Justificativa para o drop..."
            className="input-base w-full min-h-[80px] resize-none text-sm"
            maxLength={500}
          />
        </div>
        {dropOrder.isError && (
          <ErrorAlert
            message={dropOrder.error instanceof Error ? dropOrder.error.message : 'Erro'}
            className="mt-2"
          />
        )}
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="ghost" onClick={() => { setShowDropModal(false); setDropReason('') }}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={dropOrder.isPending}
            disabled={dropReason.trim().length < 10}
            onClick={() => dropOrder.mutate(dropReason.trim())}
          >
            Confirmar Drop
          </Button>
        </div>
      </Modal>
    </div>
  )
}
