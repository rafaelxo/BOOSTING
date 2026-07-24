import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft, Clock, KeyRound, ShieldCheck, QrCode, Copy, XCircle, CheckCircle2, AlertTriangle, Receipt,
  MessageCircleWarning, Gamepad2, Users, Shuffle, TrendingUp, Trophy, CalendarDays, Wallet, UserCheck,
} from 'lucide-react'
import { Button, Card, OrderStatusBadge, Skeleton, ErrorAlert, Modal, Avatar } from '@/components/ui'
import { OrderChat } from '@/components/order/OrderChat'
import { useOrderChat } from '@/api/chat'
import { OrderMatchHistory } from '@/components/order/OrderMatchHistory'
import { OrderProgress } from '@/components/order/OrderProgress'
import { OrderTimeline } from '@/components/order/OrderTimeline'
import { CountdownTimer } from '@/components/order/CountdownTimer'
import { supabase } from '@/lib/supabase'
import { EdgeFunctionError } from '@/lib/invokeEdgeFunction'
import { formatDateTime, formatRank, formatLastSeen, getServiceLabel, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_COLOR, sortOrderExtras } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import {
  useOrder, useOrderStatusHistory, useCustomerOrderState, useOrderPayments, useSetOrderCredentials,
  useConfirmOrderCompletion, useDisputeOrderCompletion, useGeneratePix, useCancelPendingOrder,
  useRequestOrderSupport, useSyncOrderMatches, getCustomerOrderState,
} from '@/api/orders'
import { useOrderSupportEscalation } from '@/api/admin'
import type { Order, BoosterProfile } from '@/types'
import type { CustomerOrderState } from '@/api/orders'
import { useQuery } from '@tanstack/react-query'

function PaymentSummarySection({ orderId }: { orderId: string }) {
  const currency = useCurrency()
  const { data: payments } = useOrderPayments(orderId)

  if (!payments?.length) return null

  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">Pagamento</h3>
      </div>
      <div className="space-y-3">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink" data-tabular>{currency(p.amount)}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">
                {formatDateTime(p.created_at)}
                {p.payment_method_type === 'pix' && ' · Pix'}
              </p>
              {p.refunded_amount > 0 && (
                <p className="text-[11px] text-ink-secondary mt-0.5">
                  Reembolsado: {currency(p.refunded_amount)}
                </p>
              )}
            </div>
            <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${PAYMENT_STATUS_COLOR[p.status] ?? ''}`}>
              {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

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

// Bloco inline (sem Card próprio) -- mesclado dentro do card "Detalhes do
// Pedido" em vez de ser um card separado na sidebar.
function AssignedBoosterBlock({ order }: { order: Order }) {
  const { data: booster, isLoading } = useAssignedBooster(order.assigned_booster_id)

  if (!order.assigned_booster_id) return null
  if (isLoading) return <div className="mt-4 pt-4 border-t border-border-subtle"><Skeleton className="h-14 w-full" /></div>
  if (!booster) return null

  return (
    <div className="mt-4 pt-4 border-t border-border-subtle">
      <p className="text-xs text-ink-muted mb-2 flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5" />Seu booster</p>
      <Link to={`/boosters/${booster.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
        <Avatar src={booster.avatar_url} name={booster.display_name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink truncate">{booster.display_name}</p>
          <p className="text-xs text-ink-muted">{formatLastSeen(booster.last_active_at)}</p>
        </div>
        {booster.rating_count > 0 && (
          <span className="text-xs font-semibold text-ink shrink-0" data-tabular>★ {booster.rating.toFixed(1)}</span>
        )}
      </Link>
    </div>
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
  const currency = useCurrency()
  const [pix, setPix] = useState<{ qr_code?: string; qr_code_base64?: string | null; total_price: number; expires_at: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  // Mostra o qr code assim que a página abre, sem exigir clique em "Efetuar
  // pagamento" -- create-pix-payment reaproveita o pagamento PIX pendente
  // existente (nunca gera um segundo), então isso sempre reexibe o MESMO qr
  // code de quando o pedido foi criado, nunca duplica cobrança.
  useEffect(() => {
    if (order.status === 'awaiting_payment') loadPix()
    // Refaz a chamada sempre que o pedido (re)entra em 'awaiting_payment' --
    // não só na primeira renderização deste pedido. Sem `order.status` aqui,
    // se o status saísse e voltasse a 'awaiting_payment' com o mesmo
    // order.id (esta seção não desmonta nesse caso), o QR nunca recarregava
    // sozinho. loadPix fica de fora de propósito (recriada a cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, order.status])

  function cancelOrder() {
    setError(null)
    cancelOrderMutation.mutate(order.id, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['orders', 'customer'] })
        queryClient.removeQueries({ queryKey: ['orders', 'detail', order.id] })
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
    <Card id="payment" padding="md">
      <div className="flex items-center gap-2 mb-3">
        <QrCode className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">Pagamento PIX</h3>
      </div>

      <p className="text-xs text-ink-muted mb-4">
        Este pedido ainda não foi pago. Você pode recuperar o PIX enquanto ele estiver válido ou cancelar o pedido.
      </p>

      {!pix ? (
        <div className="space-y-3">
          <Button className="w-full" loading={generatePix.isPending} onClick={loadPix} leftIcon={<QrCode className="h-4 w-4" />}>
            Efetuar pagamento
          </Button>
          <Button className="w-full" variant="danger" loading={cancelOrderMutation.isPending} onClick={cancelOrder} leftIcon={<XCircle className="h-4 w-4" />}>
            Cancelar pedido
          </Button>
        </div>
      ) : expired ? (
        <div className="space-y-3">
          <ErrorAlert message="Este PIX expirou. O pedido está sendo cancelado e o configurador será reiniciado." />
          <Button className="w-full" variant="danger" loading={cancelOrderMutation.isPending} onClick={cancelOrder} leftIcon={<XCircle className="h-4 w-4" />}>
            Cancelar pedido
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-bg-elevated px-4 py-3">
            <div>
              <p className="text-xs text-ink-muted">Total</p>
              <p className="text-lg font-bold text-ink" data-tabular>{currency(Number(pix.total_price))}</p>
            </div>
            <div className={`flex items-center gap-1.5 text-sm font-bold ${(remaining ?? Number.POSITIVE_INFINITY) < 120 ? 'text-danger' : 'text-ink-secondary'}`} data-tabular>
              <Clock className="h-4 w-4" />
              {label}
            </div>
          </div>

          {pix.qr_code_base64 && (
            <div className="flex justify-center">
              <div className="rounded-2xl border border-border-subtle bg-white p-3">
                <img src={`data:image/png;base64,${pix.qr_code_base64}`} alt="QR Code PIX" className="h-48 w-48" />
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-ink-secondary">Código PIX Copia e Cola</p>
            <textarea className="input-base min-h-24 w-full resize-none font-mono text-xs" value={pix.qr_code ?? ''} readOnly />
          </div>

          <Button className="w-full" variant={copied ? 'success' : 'secondary'} onClick={copyPix} leftIcon={copied ? <ShieldCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}>
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
          {copyError && <p className="text-xs text-danger">{copyError}</p>}

          <Button className="w-full" variant="danger" loading={cancelOrderMutation.isPending} onClick={cancelOrder} leftIcon={<XCircle className="h-4 w-4" />}>
            Cancelar pedido
          </Button>
        </div>
      )}

      {error && <div className="mt-3"><ErrorAlert message={error} /></div>}
    </Card>
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
    <Card id="credentials" padding="md" className="scroll-mt-24 ring-1 ring-brand/20">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">Acesso da Conta</h3>
        {state.credentials_set && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-lg">
            <ShieldCheck className="h-3 w-3" /> Salvas
          </span>
        )}
      </div>
      <p className="text-xs text-ink-muted mb-4">
        Envie as credenciais uma única vez para gerar um token criptografado de acesso. O booster verá apenas o token; login e senha não são exibidos.
      </p>
      {canSet && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-ink-secondary block mb-1">Login / E-mail da conta</label>
            <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Ex: SeuUsuario#BR1" className="input-base w-full text-sm" autoComplete="username" maxLength={160} />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-secondary block mb-1">Senha da conta</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input-base w-full text-sm" autoComplete="new-password" maxLength={256} />
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

function CompletionConfirmationSection({ order, state }: { order: Order; state?: CustomerOrderState }) {
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const confirm = useConfirmOrderCompletion(order.id)
  const dispute = useDisputeOrderCompletion(order.id)

  if (!state?.can_confirm_completion) return null

  return (
    <Card padding="md" className="ring-1 ring-success/20">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <h3 className="text-sm font-semibold text-ink">Confirmação necessária</h3>
      </div>
      <p className="text-xs text-ink-secondary mb-4">
        Serviço concluído! O booster finalizou o pedido. Confirme a conclusão após revisar o resultado.
      </p>
      <div className="space-y-2">
        <Button className="w-full" variant="success" leftIcon={<CheckCircle2 className="h-4 w-4" />} loading={confirm.isPending} onClick={() => confirm.mutate()}>
          Confirmar conclusão
        </Button>
        <Button className="w-full" variant="danger-ghost" leftIcon={<AlertTriangle className="h-4 w-4" />} onClick={() => setShowDisputeModal(true)}>
          Não recebi o que contratei
        </Button>
      </div>
      {(confirm.isError || dispute.isError) && (
        <ErrorAlert
          className="mt-2"
          message={
            (confirm.error instanceof Error && confirm.error.message) ||
            (dispute.error instanceof Error && dispute.error.message) ||
            'Erro ao processar sua solicitação'
          }
        />
      )}

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
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="ghost" onClick={() => { setShowDisputeModal(false); setDisputeReason('') }}>Cancelar</Button>
          <Button variant="danger" loading={dispute.isPending} disabled={disputeReason.trim().length < 10} onClick={() => dispute.mutate(disputeReason.trim(), { onSuccess: () => setShowDisputeModal(false) })}>
            Enviar disputa
          </Button>
        </div>
      </Modal>
    </Card>
  )
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const currency = useCurrency()

  const { data: order, isLoading, isError, refetch } = useOrder(id)
  const { data: history } = useOrderStatusHistory(id)
  const { data: customerState } = useCustomerOrderState(id)
  const syncMatches = useSyncOrderMatches(id ?? '')
  // Dispara a busca do chat em paralelo com o pedido, em vez de esperar
  // isLoading resolver pra só então montar <OrderChat> -- mesma query key do
  // hook interno dele, então o resultado já vem do cache quando ele monta.
  useOrderChat(id)

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

  const hasRankRail = !!(order.target_rank && order.current_rank && !order.pdl_bracket)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar">
          <Link to="/orders"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-ink">
              {t('customer.order.id', { id: order.id.slice(0, 8).toUpperCase() })}
            </h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-ink-secondary mt-0.5">
            {getServiceLabel(order.service_type)} · {t('customer.order.created', { date: formatDateTime(order.created_at) })}
          </p>
        </div>
        {['in_progress', 'paused', 'awaiting_customer'].includes(order.status) && (
          <CountdownTimer startedAt={order.match_sync_started_at} estimatedHours={order.estimated_hours} />
        )}
      </div>

      {['in_progress', 'paused', 'awaiting_customer'].includes(order.status) && (
        <LateOrderSupportBanner order={order} />
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-5">
          <Card padding="md">
            {['awaiting_payment', 'in_progress', 'paused', 'awaiting_customer', 'completed'].includes(order.status) && (
              <OrderProgress order={order} />
            )}
            <h3 className="text-sm font-semibold text-ink mb-4">{t('customer.order.details')}</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Gamepad2, label: t('customer.order.service'), value: getServiceLabel(order.service_type) },
                ...(order.service_type === 'elo_boost' || order.service_type === 'win_boost' || order.service_type === 'md5'
                  ? [{ icon: Users, label: t('customer.order.queue'), value: order.queue_type === 'solo_duo' ? t('customer.order.soloQueue') : t('customer.order.flexQueue') }]
                  : []),
                ...(order.service_type === 'elo_boost' && !order.pdl_bracket
                  ? [{ icon: Shuffle, label: 'Modo', value: order.boost_mode === 'duo' ? 'Duo Boost' : 'Solo Boost' }]
                  : []),
                ...(!hasRankRail && order.current_rank ? [{
                  icon: TrendingUp, label: t('customer.order.currentRank'),
                  value: formatRank((order.current_rank as { tier: string }).tier as never, (order.current_rank as { division: string }).division),
                }] : []),
                ...(!hasRankRail && order.service_type === 'elo_boost' && order.target_rank ? [{
                  icon: TrendingUp, label: t('customer.order.targetRank'),
                  value: formatRank((order.target_rank as { tier: string }).tier as never, (order.target_rank as { division: string }).division),
                }] : []),
                ...(order.pdl_bracket ? [
                  { icon: TrendingUp, label: 'PDL Atual', value: `${order.current_pdl ?? '—'} PDL` },
                  { icon: TrendingUp, label: 'Méd. PDL Ganho/Vitória', value: order.avg_pdl_gain != null ? `+${order.avg_pdl_gain} PDL` : '—' },
                  { icon: TrendingUp, label: 'Méd. PDL Perdido/Derrota', value: order.avg_pdl_loss != null ? `−${order.avg_pdl_loss} PDL` : '—' },
                ] : []),
                ...((order.service_type === 'win_boost' || order.service_type === 'md5') && order.wins_purchased
                  ? [{ icon: Trophy, label: 'Vitórias Compradas', value: `${order.wins_purchased}` }]
                  : []),
                ...(order.service_type === 'coaching' && order.sessions_purchased
                  ? [{ icon: CalendarDays, label: 'Sessões', value: `${order.sessions_purchased}` }]
                  : []),
                { icon: Wallet, label: t('customer.order.totalPaid'), value: currency(order.total_price) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label}>
                  <p className="text-xs text-ink-muted flex items-center gap-1"><Icon className="h-3 w-3 shrink-0" />{label}</p>
                  <p className="text-sm font-semibold text-ink mt-0.5 capitalize" data-tabular>{value}</p>
                </div>
              ))}
            </div>

            {order.extras?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <p className="text-xs text-ink-muted mb-2">Extras</p>
                <div className="space-y-1.5">
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
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <p className="text-xs text-ink-muted mb-1">{t('customer.order.notes')}</p>
                <p className="text-sm text-ink-secondary">{order.customer_notes}</p>
              </div>
            )}

            <AssignedBoosterBlock order={order} />
          </Card>

          {order.riot_id && ['in_progress', 'paused', 'awaiting_customer', 'completed'].includes(order.status) && (
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

        {/* Sidebar -- ordem padronizada com booster/admin: ações do papel,
            depois o card mais "sensível" (aqui, credenciais) logo acima do
            chat, depois chat, depois histórico do pedido. */}
        <div className="space-y-4">
          <PendingPaymentSection order={order} />
          <CompletionConfirmationSection order={order} state={customerState} />

          {order.status === 'completed' && (
            <Card padding="md" className="ring-1 ring-success/20">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <p className="text-sm text-ink-secondary">Serviço concluído! Seu pedido foi finalizado com sucesso.</p>
              </div>
            </Card>
          )}

          <PaymentSummarySection orderId={order.id} />
          <CredentialsSection order={order} state={customerState} />

          <OrderChat orderId={order.id} viewerRole="customer" orderStatus={order.status} />

          <OrderTimeline history={history} />
        </div>
      </div>
    </div>
  )
}
