import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Clock, History, KeyRound, Lock, ShieldCheck, QrCode, XCircle, CheckCircle2, AlertTriangle,
  MessageCircleWarning, Users, Shuffle, CalendarDays, Wallet, UserCheck, Hash, Trophy,
} from 'lucide-react'
import { Button, Card, OrderStatusBadge, Skeleton, ErrorAlert, Modal, GuaranteeNotice } from '@/components/ui'
import { OrderPageHeader } from '@/components/order/OrderPageHeader'
import { OrderInfoGrid, type OrderInfoGridItem } from '@/components/order/OrderInfoGrid'
import { OrderChatPanel } from '@/components/order/OrderChatPanel'
import { PixWaitingPanel } from '@/components/order/PixWaitingPanel'
import { useOrderChat } from '@/api/chat'
import { OrderMatchHistory } from '@/components/order/OrderMatchHistory'
import { OrderCoachingTopics } from '@/components/order/OrderCoachingTopics'
import { OrderProgress } from '@/components/order/OrderProgress'
import { OrderRankSummary } from '@/components/order/OrderRankSummary'
import { OrderTimeline } from '@/components/order/OrderTimeline'
import { OrderReviewSection } from '@/components/order/OrderReviewSection'
import { CountdownTimer } from '@/components/order/CountdownTimer'
import { supabase } from '@/lib/supabase'
import { EdgeFunctionError } from '@/lib/invokeEdgeFunction'
import { formatDateTime, formatEstimatedDelivery, getServiceLabel, sortOrderExtras } from '@/lib/utils'
import { CLASH_TIER_LABEL, CLASH_TIER_RANGE_LABEL, CLASH_DAY_LABEL } from '@/lib/clashDomain'
import { useCurrency } from '@/hooks/useCurrency'
import {
  useOrder, useOrderStatusHistory, useCustomerOrderState, useSetOrderCredentials,
  useConfirmOrderCompletion, useDisputeOrderCompletion, useGeneratePix, useCancelPendingOrder,
  useRequestOrderSupport, useRequestCustomerOrderDrop, useSyncOrderMatches, getCustomerOrderState,
} from '@/api/orders'
import { useOrderSupportEscalation } from '@/api/admin'
import { useBoosterServiceDetails } from '@/api/coaching'
import type { Order, BoosterProfile, OrderStatus } from '@/types'
import type { CustomerOrderState } from '@/api/orders'
import { useQuery } from '@tanstack/react-query'

function useAssignedBooster(boosterId: string | null) {
  return useQuery({
    queryKey: ['order-assigned-booster', boosterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_booster_profiles')
        .select('id, user_id, display_name, avatar_url, last_active_at, rating, rating_count')
        .eq('user_id', boosterId!)
        .maybeSingle()
      if (error) throw error
      return data as Pick<BoosterProfile, 'id' | 'user_id' | 'display_name' | 'avatar_url' | 'last_active_at' | 'rating' | 'rating_count'> | null
    },
    enabled: !!boosterId,
  })
}

function AssignedBoosterValue({ order }: { order: Order }) {
  const { data: booster, isLoading } = useAssignedBooster(order.assigned_booster_id)
  if (isLoading) return <Skeleton className="h-5 w-20 mx-auto" />
  if (!booster) return <span>Não associado</span>
  return (
    <Link to={`/boosters/${encodeURIComponent(booster.display_name)}`} className="text-brand hover:underline">
      {booster.display_name}
    </Link>
  )
}

// Prazo estourado: acionamento de suporte auditado no backend (migration 083),
// não só o link estático que já existia no CountdownTimer.
function LateOrderSupportBanner({ order }: { order: Order }) {
  const { data: escalation } = useOrderSupportEscalation(order.id)
  const requestSupport = useRequestOrderSupport(order.id)

  if (!order.match_sync_started_at || !order.estimated_hours) return null
  const deadline = new Date(order.match_sync_started_at).getTime() + order.estimated_hours * 3600_000
  if (Date.now() <= deadline) return null

  return (
    <Card padding="md" className="ring-1 ring-danger/25 bg-danger/5">
      <div className="flex items-start gap-3">
        <MessageCircleWarning className="h-5 w-5 text-danger shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">Prazo estimado excedido</p>
          <p className="text-xs text-ink-secondary mt-1">
            {escalation
              ? 'Suporte já foi acionado para este pedido — nossa equipe está acompanhando.'
              : 'Este pedido está demorando mais que o estimado. Você pode acionar o suporte para acompanhamento prioritário.'}
          </p>
          {!escalation && (
            <Button
              size="sm"
              variant="danger"
              className="mt-3"
              loading={requestSupport.isPending}
              onClick={() => requestSupport.mutate()}
              leftIcon={<MessageCircleWarning className="h-4 w-4" />}
            >
              Acionar suporte
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function pixErrorMessage(err: unknown) {
  if (!(err instanceof EdgeFunctionError)) return err instanceof Error ? err.message : 'Erro ao carregar PIX'
  if (err.status === 401) return 'Sua sessão expirou. Entre novamente para continuar.'
  if (err.status === 403) return 'Você não tem permissão para esse pedido.'
  if (err.status === 409) return err.message
  return err.message
}

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(null)
      return
    }
    const tick = () => setRemaining(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [expiresAt])

  const safeRemaining = remaining ?? 0
  const mm = String(Math.floor(safeRemaining / 60)).padStart(2, '0')
  const ss = String(safeRemaining % 60).padStart(2, '0')
  return { remaining, label: `${mm}:${ss}` }
}

function PendingPaymentSection({ order }: { order: Order }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pix, setPix] = useState<{ qr_code?: string; qr_code_base64?: string | null; total_price: number; expires_at: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Popup em vez de card fixo no topo -- abre sozinho ao entrar na página
  // (mesmo momento em que loadPix() já dispara sozinho, abaixo). Se o
  // cliente fechar sem pagar, o pedido continua pendente e o banner
  // compacto abaixo permite reabrir o popup quando quiser.
  const [open, setOpen] = useState(order.status === 'awaiting_payment')
  const { remaining, label } = useCountdown(pix?.expires_at ?? null)

  const generatePix = useGeneratePix(order.id)
  const cancelOrderMutation = useCancelPendingOrder()

  useEffect(() => {
    if (!pix || order.status !== 'awaiting_payment') return
    const interval = window.setInterval(async () => {
      const state = await getCustomerOrderState(order.id).catch(() => null)
      if (state?.payment_confirmed) {
        window.clearInterval(interval)
        queryClient.setQueryData(['orders', 'state', order.id], state)
        if (state.requires_credentials) {
          navigate(`/orders/${order.id}#credentials`, { replace: true })
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['orders', 'detail', order.id] }),
          queryClient.invalidateQueries({ queryKey: ['orders', 'customer'] }),
        ])
      }
    }, 5000)
    return () => window.clearInterval(interval)
  }, [pix, order.id, order.status, queryClient, navigate])

  function loadPix() {
    setError(null)
    generatePix.mutate(undefined, {
      onSuccess: (response) => {
        if (!response.qr_code) { setError('A função não retornou o código PIX.'); return }
        setPix(response)
      },
      onError: (err) => setError(pixErrorMessage(err)),
    })
  }

  useEffect(() => {
    if (order.status === 'awaiting_payment') loadPix()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, order.status])

  function cancelOrder() {
    setError(null)
    cancelOrderMutation.mutate(order.id, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['orders', 'customer'] })
        queryClient.removeQueries({ queryKey: ['orders', 'detail', order.id] })
        queryClient.invalidateQueries({ queryKey: ['resumable-customer-order'] })
        navigate('/orders/new?new=1', { replace: true })
      },
      onError: async () => {
        const state = await getCustomerOrderState(order.id).catch(() => null)
        if (state?.payment_confirmed) {
          queryClient.setQueryData(['orders', 'state', order.id], state)
          await queryClient.invalidateQueries({ queryKey: ['orders', 'detail', order.id] })
          navigate(`/orders/${order.id}${state.requires_credentials ? '#credentials' : ''}`, { replace: true })
          return
        }
        queryClient.invalidateQueries({ queryKey: ['orders', 'customer'] })
        queryClient.invalidateQueries({ queryKey: ['resumable-customer-order'] })
        navigate('/orders/new?new=1', { replace: true })
      },
    })
  }

  useEffect(() => {
    if (!pix || remaining !== 0) return
    cancelOrder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, pix])

  async function copyPix() {
    if (!pix?.qr_code) return
    try {
      await navigator.clipboard.writeText(pix.qr_code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopyError('Não foi possível copiar automaticamente. Selecione o código acima e copie manualmente.')
      window.setTimeout(() => setCopyError(null), 4000)
    }
  }

  if (order.status !== 'awaiting_payment') return null

  const expired = remaining === 0

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/25 bg-warning/10 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-warning min-w-0">
          <QrCode className="h-4 w-4 shrink-0" />
          <span className="font-semibold whitespace-nowrap">Pagamento pendente</span>
          <span className="text-ink-muted truncate hidden sm:inline">— este pedido ainda não foi pago.</span>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} leftIcon={<QrCode className="h-4 w-4" />} className="shrink-0">
          Ver PIX
        </Button>
      </div>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Pagamento PIX"
        description="Este pedido ainda não foi pago. Você pode recuperar o PIX enquanto ele estiver válido ou cancelar o pedido."
        maxWidth="xl"
      >
        {!pix ? (
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <Button className="w-full" loading={generatePix.isPending} onClick={loadPix} leftIcon={<QrCode className="h-4 w-4" />}>
            Efetuar pagamento
          </Button>
          <Button className="w-full" variant="danger" loading={cancelOrderMutation.isPending} onClick={cancelOrder} leftIcon={<XCircle className="h-4 w-4" />}>
            Cancelar pedido
          </Button>
        </div>
      ) : expired ? (
        <div className="space-y-3 max-w-md">
          <ErrorAlert message="Este PIX expirou. O pedido está sendo cancelado e o configurador será reiniciado." />
          <Button className="w-full" variant="danger" loading={cancelOrderMutation.isPending} onClick={cancelOrder} leftIcon={<XCircle className="h-4 w-4" />}>
            Cancelar pedido
          </Button>
        </div>
      ) : (
        <PixWaitingPanel
          totalPrice={Number(pix.total_price)}
          qrCode={pix.qr_code ?? ''}
          qrCodeBase64={pix.qr_code_base64 ?? null}
          remaining={remaining}
          countdownLabel={label}
          copied={copied}
          copyError={copyError}
          onCopy={copyPix}
          onCancel={cancelOrder}
          cancelling={cancelOrderMutation.isPending}
        />
      )}

      {error && <div className="mt-3"><ErrorAlert message={error} /></div>}
      </Modal>
    </>
  )
}

function CredentialsSection({ order, state }: { order: Order; state?: CustomerOrderState }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [saved, setSaved] = useState(false)
  const saveCredentials = useSetOrderCredentials(order.id)

  if (!state?.requires_credentials) return null
  const canSet = state.can_submit_credentials === true
  if (!canSet && !state.credentials_set) return null

  function submit() {
    saveCredentials.mutate({ orderId: order.id, login: login.trim(), password }, {
      onSuccess: () => {
        setSaved(true)
        setLogin('')
        setPassword('')
        setTimeout(() => setSaved(false), 3000)
      },
    })
  }

  return (
    <Card id="credentials" padding="lg" className="scroll-mt-24">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">Conta do pedido</h3>
        {state.credentials_set && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-lg">
            <ShieldCheck className="h-3 w-3" /> Salvas
          </span>
        )}
      </div>
      <p className="text-xs text-ink-muted mb-4">
        Envie as credenciais uma única vez para gerar um token criptografado de acesso. O booster verá apenas o token; login e senha não são exibidos.
      </p>
      <div className="mb-4">
        <GuaranteeNotice title="Evite entrar na conta durante o pedido" variant="warning">
          O booster faz login e joga direto na sua conta nesse tipo de serviço. Para não
          atrapalhar o progresso nem gerar divergência de resultado, evite entrar na conta até
          o pedido ser finalizado — acompanhe o andamento por aqui e pelo chat com o booster.
        </GuaranteeNotice>
      </div>
      {canSet && (
        <div className="space-y-3 max-w-md">
          <div>
            <label className="text-xs font-semibold text-ink-secondary block mb-1">Login / E-mail da conta</label>
            <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Ex: SeuUsuario#BR1" className="input-base w-full text-sm" autoComplete="username" maxLength={160} />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-secondary block mb-1">Senha da conta</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input-base w-full text-sm" autoComplete="current-password" maxLength={256} />
            <p className="text-[10px] text-ink-muted mt-1">O valor enviado é transformado em payload criptografado no banco. Não compartilhe a senha no chat.</p>
          </div>
          <Button size="sm" className="w-full" loading={saveCredentials.isPending} disabled={!login.trim() || password.length < 4} onClick={submit} variant={saved ? 'success' : 'primary'}>
            {saved ? 'Credenciais salvas!' : state.credentials_set ? 'Atualizar credenciais' : 'Salvar credenciais'}
          </Button>
          {saveCredentials.isError && (
            <ErrorAlert message={saveCredentials.error instanceof Error ? saveCredentials.error.message : 'Erro'} />
          )}
        </div>
      )}
    </Card>
  )
}

const CUSTOMER_DROPPABLE_STATUSES: OrderStatus[] = ['assigned', 'in_progress', 'paused', 'awaiting_customer']

function DropLockedBanner({ order }: { order: Order }) {
  if (order.status !== 'drop_requested') return null
  return (
    <Card padding="md" className="border border-warning/30 bg-warning/5">
      <div className="flex items-center gap-2 text-warning text-sm font-semibold">
        <Lock className="h-4 w-4" />
        Pedido travado · solicitação em análise
      </div>
      <p className="text-xs text-ink-secondary mt-1">
        O admin está analisando o motivo da troca de booster. Nenhuma nova ação de boost acontece
        enquanto isso — chat, histórico de partidas e histórico do pedido continuam disponíveis normalmente.
      </p>
    </Card>
  )
}

function CustomerDropModal({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const [dropReason, setDropReason] = useState('')
  const requestDrop = useRequestCustomerOrderDrop(order.id)
  const remainingDrops = Math.max(0, 2 - order.drop_count)

  return (
    <Modal
      open={open}
      onOpenChange={(next) => { if (!next) { onClose(); setDropReason('') } }}
      title="Solicitar troca de booster"
      description="Sua solicitação será enviada ao admin para aprovação. O pedido continua ativo -- o booster atual é substituído e o pedido volta pro painel pra outro assumir, com valor e prazo já ajustados ao progresso entregue até aqui. Você não é cobrado nem reembolsado por isso."
    >
      <p className="text-xs font-medium text-ink-secondary bg-bg-elevated rounded-lg px-3 py-2">
        Você ainda possui {remainingDrops} drop{remainingDrops === 1 ? '' : 's'} disponíve{remainingDrops === 1 ? 'l' : 'is'} para este pedido.
      </p>
      <div>
        <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
          Motivo <span className="text-danger">*</span>
        </label>
        <textarea value={dropReason} onChange={(e) => setDropReason(e.target.value)} placeholder="Descreva o motivo..." className="input-base w-full min-h-[100px] resize-none text-sm" maxLength={500} />
      </div>
      {requestDrop.isError && (
        <ErrorAlert message={requestDrop.error instanceof Error ? requestDrop.error.message : 'Erro'} className="mt-2" />
      )}
      <div className="flex gap-3 justify-end pt-2">
        <Button variant="ghost" onClick={() => { onClose(); setDropReason('') }}>Cancelar</Button>
        <Button
          variant="danger"
          loading={requestDrop.isPending}
          disabled={dropReason.trim().length < 10}
          onClick={() => requestDrop.mutate(dropReason.trim(), { onSuccess: () => { onClose(); setDropReason('') } })}
        >
          Enviar Solicitação
        </Button>
      </div>
    </Modal>
  )
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const currency = useCurrency()
  const [chatOpen, setChatOpen] = useState(false)
  const [dropModalOpen, setDropModalOpen] = useState(false)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')

  const { data: order, isLoading, isError, refetch } = useOrder(id)
  const { data: history } = useOrderStatusHistory(id)
  const { data: customerState } = useCustomerOrderState(id)
  const syncMatches = useSyncOrderMatches(id ?? '')
  const chat = useOrderChat(id)
  const confirmCompletion = useConfirmOrderCompletion(id ?? '')
  const disputeCompletion = useDisputeOrderCompletion(id ?? '')
  const { data: coachPackage } = useBoosterServiceDetails(order?.booster_service_id ?? undefined)

  useEffect(() => {
    if (!order || window.location.hash !== '#credentials' || !customerState?.requires_credentials) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('credentials')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [order, customerState?.requires_credentials])

  useEffect(() => {
    if (order?.status === 'canceled') navigate('/orders/new?new=1', { replace: true })
  }, [order?.status, navigate])

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )

  if (isError) {
    return (
      <div className="space-y-4">
        <ErrorAlert message="Não foi possível carregar o pedido. Tente novamente." />
        <Button onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <ErrorAlert message="Pedido não encontrado." />
        <Button onClick={() => navigate('/orders')}>Voltar para meus pedidos</Button>
      </div>
    )
  }

  const isBoostFlow = order.service_type === 'elo_boost' || order.service_type === 'win_boost' || order.service_type === 'md5'
  const modeLabel = order.service_type === 'elo_boost'
    ? (order.boost_mode === 'duo' ? 'Duo Boost' : 'Solo Boost')
    : order.service_type === 'md5' ? (order.boost_mode === 'duo' ? 'Duo MD5' : 'MD5')
    : order.service_type === 'win_boost' ? (order.boost_mode === 'duo' ? 'Duo Vitórias' : 'Vitórias')
    : getServiceLabel(order.service_type)

  const infoItems: OrderInfoGridItem[] = [
    ...(isBoostFlow ? [{ icon: Shuffle, label: 'Modo do pedido', value: modeLabel }] : []),
    ...(isBoostFlow ? [{ icon: Users, label: 'Fila', value: order.queue_type === 'solo_duo' ? 'Solo/Duo' : 'Flex' }] : []),
    ...((isBoostFlow || order.service_type === 'clash') ? [{ icon: Hash, label: 'Riot ID', value: order.riot_id ?? 'Não informado' }] : []),
    { icon: Clock, label: 'Entrega estimada', value: order.estimated_hours ? formatEstimatedDelivery(order.estimated_hours) : 'Não disponível' },
    ...((order.service_type === 'win_boost' || order.service_type === 'md5') && order.wins_purchased != null
      ? [{ icon: Trophy, label: 'Vitórias Compradas', value: `${order.wins_purchased}` }]
      : []),
    ...(order.service_type === 'coaching' && order.sessions_purchased
      ? [{ icon: CalendarDays, label: 'Sessões', value: `${order.sessions_purchased}` }]
      : []),
    { icon: UserCheck, label: 'Booster associado', value: <AssignedBoosterValue order={order} /> },
    { icon: Wallet, label: t('customer.order.totalPaid'), value: currency(order.total_price) },
  ]

  const dropVisible = CUSTOMER_DROPPABLE_STATUSES.includes(order.status)
  const dropLimitReached = order.drop_count >= 2
  const canConfirm = !!customerState?.can_confirm_completion

  return (
    <div className="space-y-6">
      <OrderPageHeader
        backHref="/orders"
        orderIdShort={order.id.slice(0, 8).toUpperCase()}
        statusBadge={<OrderStatusBadge status={order.status} />}
        extra={(
          <>
            <span className="text-xs text-ink-muted">
              {getServiceLabel(order.service_type)} · {t('customer.order.created', { date: formatDateTime(order.created_at) })}
            </span>
            {order.drop_count > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wide bg-warning/15 text-warning border border-warning/30">
                <History className="h-3 w-3" />
                Pedido reatribuído · valor e prazo atualizados
              </span>
            )}
            {['in_progress', 'paused', 'awaiting_customer'].includes(order.status) && (
              <CountdownTimer startedAt={order.match_sync_started_at} estimatedHours={order.estimated_hours} />
            )}
          </>
        )}
        onDrop={dropVisible ? () => setDropModalOpen(true) : undefined}
        dropDisabled={dropLimitReached}
        dropTooltip="Limite de drops atingido."
        onChat={() => setChatOpen(true)}
        chatUnavailable={chat.data ? !chat.data.chat_available : true}
        primary={canConfirm ? (
          <>
            <Button variant="danger-ghost" size="sm" leftIcon={<AlertTriangle className="h-4 w-4" />} onClick={() => setShowDisputeModal(true)}>
              Disputar
            </Button>
            <Button variant="success" size="sm" leftIcon={<CheckCircle2 className="h-4 w-4" />} loading={confirmCompletion.isPending} onClick={() => confirmCompletion.mutate()}>
              Confirmar conclusão
            </Button>
          </>
        ) : undefined}
      />

      {confirmCompletion.isError && <ErrorAlert message={confirmCompletion.error instanceof Error ? confirmCompletion.error.message : 'Erro ao confirmar'} />}
      <DropLockedBanner order={order} />
      {['in_progress', 'paused', 'awaiting_customer'].includes(order.status) && <LateOrderSupportBanner order={order} />}
      {order.status === 'completed' && (
        <Card padding="md" className="ring-1 ring-success/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <p className="text-sm text-ink-secondary">Serviço concluído! Seu pedido foi finalizado com sucesso.</p>
          </div>
        </Card>
      )}

      <PendingPaymentSection order={order} />

      {/* Detalhes do pedido */}
      <Card padding="lg">
        <h3 className="text-sm font-semibold text-ink mb-5">{t('customer.order.details')}</h3>

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
                ? 'Você vai jogar junto com o booster.'
                : 'O booster vai jogar na sua conta.'}
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-xs text-ink-muted">
              <span>{CLASH_TIER_LABEL[order.clash_tier]}: <span className="font-semibold text-ink">{CLASH_TIER_RANGE_LABEL[order.clash_tier]}</span></span>
              {order.clash_day && <span>Dia: <span className="font-semibold text-ink">{CLASH_DAY_LABEL[order.clash_day]}</span></span>}
            </div>
          </div>
        )}

        <OrderRankSummary order={order} />

        {['awaiting_payment', 'paid', 'awaiting_assignment', 'assigned', 'in_progress', 'paused', 'drop_requested', 'awaiting_customer', 'completed', 'disputed'].includes(order.status) && (
          <OrderProgress order={order} hideRankBadges />
        )}

        <div className="mt-5">
          <OrderInfoGrid items={infoItems} />
        </div>

        {order.extras?.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border-subtle">
            <p className="text-xs text-ink-muted mb-2">Extras</p>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {sortOrderExtras(order.extras).map((extra) => (
                <div key={extra.extra_id} className="flex items-center justify-between text-sm">
                  <span className="text-ink-secondary">{extra.name}</span>
                  <span className="font-semibold text-ink" data-tabular>{currency(extra.price)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {order.customer_notes && (
          <div className="mt-5 pt-4 border-t border-border-subtle">
            <p className="text-xs text-ink-muted mb-1">{t('customer.order.notes')}</p>
            <p className="text-sm text-ink-secondary">{order.customer_notes}</p>
          </div>
        )}
      </Card>

      <CredentialsSection order={order} state={customerState} />

      {/* Histórico de partidas / coaching */}
      {order.service_type === 'coaching'
        ? ['assigned', 'in_progress', 'paused', 'awaiting_customer', 'completed'].includes(order.status) && (
          <OrderCoachingTopics orderId={order.id} />
        )
        : order.riot_id && order.service_type !== 'clash' && ['in_progress', 'paused', 'awaiting_customer', 'drop_requested', 'completed'].includes(order.status) && (
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

      <OrderReviewSection order={order} />

      <OrderTimeline history={history} />

      <OrderChatPanel
        open={chatOpen}
        onOpenChange={setChatOpen}
        orderId={order.id}
        viewerRole="customer"
        orderStatus={order.status}
      />

      <CustomerDropModal order={order} open={dropModalOpen} onClose={() => setDropModalOpen(false)} />

      <Modal
        open={showDisputeModal}
        onOpenChange={(open) => { if (!open) { setShowDisputeModal(false); setDisputeReason('') } }}
        title="Abrir disputa"
        description="Conte o que não foi entregue conforme contratado. Um administrador vai revisar o pedido."
      >
        <div>
          <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
            Motivo <span className="text-danger">*</span>
          </label>
          <textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="Descreva o que aconteceu..." className="input-base w-full min-h-[100px] resize-none text-sm" />
        </div>
        {disputeCompletion.isError && (
          <ErrorAlert message={disputeCompletion.error instanceof Error ? disputeCompletion.error.message : 'Erro'} className="mt-2" />
        )}
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="ghost" onClick={() => { setShowDisputeModal(false); setDisputeReason('') }}>Cancelar</Button>
          <Button variant="danger" loading={disputeCompletion.isPending} disabled={disputeReason.trim().length < 10} onClick={() => disputeCompletion.mutate(disputeReason.trim(), { onSuccess: () => setShowDisputeModal(false) })}>
            Enviar disputa
          </Button>
        </div>
      </Modal>
    </div>
  )
}
