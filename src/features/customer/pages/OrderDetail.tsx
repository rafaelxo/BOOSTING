import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Clock, KeyRound, ShieldCheck, QrCode, Copy, XCircle, RefreshCw } from 'lucide-react'
import { Button, Card, OrderStatusBadge, Skeleton, ErrorAlert } from '@/components/ui'
import { OrderChat } from '@/components/order/OrderChat'
import { supabase } from '@/lib/supabase'
import { EdgeFunctionError, invokeEdgeFunction } from '@/lib/invokeEdgeFunction'
import { formatDateTime, timeAgo, formatRank, getServiceLabel, ORDER_STATUS_LABEL, sortOrderExtras } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import { ORDER_SAFE_COLUMNS } from '@/lib/orderColumns'
import { getCustomerOrderState, type CustomerOrderState } from '@/lib/customerOrderState'
import type { Order, OrderStatusHistory } from '@/types'

function useOrder(id: string, refetchInterval?: number) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select(ORDER_SAFE_COLUMNS).eq('id', id).single()
      if (error) throw error
      return data as unknown as Order
    },
    refetchInterval,
  })
}

function useOrderHistory(orderId: string) {
  return useQuery({
    queryKey: ['order-history', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_status_history')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as OrderStatusHistory[]
    },
  })
}

type PixPaymentResponse = {
  success?: boolean
  order_id: string
  total_price: number
  payment_id: string | number
  status?: string
  qr_code?: string
  qr_code_base64?: string | null
  expires_at: string
  reused?: boolean
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

function pixErrorMessage(err: unknown) {
  if (!(err instanceof EdgeFunctionError)) return err instanceof Error ? err.message : 'Erro ao carregar PIX'
  if (err.status === 401) return 'Sua sessão expirou. Entre novamente para continuar.'
  if (err.status === 403) return 'Você não tem permissão para esse pedido.'
  if (err.status === 409) return err.message
  return err.message
}

function PendingPaymentSection({ order }: { order: Order }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currency = useCurrency()
  const [pix, setPix] = useState<PixPaymentResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { remaining, label } = useCountdown(pix?.expires_at ?? null)

  // Depois que o cliente abre a cobrança por "Meus pedidos", acompanhe a
  // confirmação do webhook da mesma forma que a etapa original do checkout.
  // Sem isso o pagamento era aceito, mas a tela continuava indefinidamente
  // como "Aguardando pagamento" até um reload manual.
  useEffect(() => {
    if (!pix || order.status !== 'awaiting_payment') return

    const interval = window.setInterval(async () => {
      const state = await getCustomerOrderState(order.id).catch(() => null)

      if (state?.payment_confirmed) {
        window.clearInterval(interval)
        queryClient.setQueryData(['customer-order-state', order.id], state)
        if (state.requires_credentials) {
          navigate(`/orders/${order.id}#credentials`, { replace: true })
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['order', order.id] }),
          queryClient.invalidateQueries({ queryKey: ['customer-orders'] }),
        ])
      }
    }, 5000)

    return () => window.clearInterval(interval)
  }, [pix, order.id, order.status, queryClient, navigate])

  const loadPix = useMutation({
    mutationFn: async () => {
      setError(null)
      const response = await invokeEdgeFunction<PixPaymentResponse>('create-pix-payment', {
        body: { order_id: order.id },
        timeoutMs: 25_000,
        requireAuth: true,
      })
      if (!response.qr_code) throw new Error('A função não retornou o código PIX.')
      return response
    },
    onSuccess: (response) => setPix(response),
    onError: (err) => setError(pixErrorMessage(err)),
  })

  const cancelOrder = useMutation({
    mutationFn: async () => {
      setError(null)
      await invokeEdgeFunction('cancel-pending-order', {
        body: { order_id: order.id },
        timeoutMs: 20_000,
        requireAuth: true,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
      queryClient.invalidateQueries({ queryKey: ['resumable-customer-order'] })
      queryClient.removeQueries({ queryKey: ['order', order.id] })
      navigate('/orders/new?new=1', { replace: true })
    },
    onError: async () => {
      // Payment approval may race the last countdown second. If it won, keep
      // the order and continue to the credential step; otherwise leave the
      // expired checkout and reset the configurator.
      const state = await getCustomerOrderState(order.id).catch(() => null)
      if (state?.payment_confirmed) {
        queryClient.setQueryData(['customer-order-state', order.id], state)
        await queryClient.invalidateQueries({ queryKey: ['order', order.id] })
        navigate(`/orders/${order.id}${state.requires_credentials ? '#credentials' : ''}`, { replace: true })
        return
      }
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
      queryClient.invalidateQueries({ queryKey: ['resumable-customer-order'] })
      navigate('/orders/new?new=1', { replace: true })
    },
  })

  useEffect(() => {
    if (!pix || remaining !== 0) return
    cancelOrder.mutate()
  // The expiration transition should run once when remaining reaches zero.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, pix])

  async function copyPix() {
    if (!pix?.qr_code) return
    await navigator.clipboard.writeText(pix.qr_code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2500)
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
          <Button
            className="w-full"
            loading={loadPix.isPending}
            onClick={() => loadPix.mutate()}
            leftIcon={<QrCode className="h-4 w-4" />}
          >
            Efetuar pagamento
          </Button>
          <Button
            className="w-full"
            variant="danger"
            loading={cancelOrder.isPending}
            onClick={() => cancelOrder.mutate()}
            leftIcon={<XCircle className="h-4 w-4" />}
          >
            Cancelar pedido
          </Button>
        </div>
      ) : expired ? (
        <div className="space-y-3">
          <ErrorAlert message="Este PIX expirou. O pedido está sendo cancelado e o configurador será reiniciado." />
          <Button
            className="w-full"
            variant="danger"
            loading={cancelOrder.isPending}
            onClick={() => cancelOrder.mutate()}
            leftIcon={<XCircle className="h-4 w-4" />}
          >
            Cancelar pedido
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-bg-elevated px-4 py-3">
            <div>
              <p className="text-xs text-ink-muted">Total</p>
              <p className="text-lg font-bold text-ink">{currency(Number(pix.total_price))}</p>
            </div>
            <div className={`flex items-center gap-1.5 text-sm font-bold ${(remaining ?? Number.POSITIVE_INFINITY) < 120 ? 'text-danger' : 'text-ink-secondary'}`}>
              <Clock className="h-4 w-4" />
              {label}
            </div>
          </div>

          {pix.qr_code_base64 && (
            <div className="flex justify-center">
              <div className="rounded-2xl border border-bg-elevated bg-white p-3">
                <img src={`data:image/png;base64,${pix.qr_code_base64}`} alt="QR Code PIX" className="h-48 w-48" />
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-ink-secondary">Código PIX Copia e Cola</p>
            <textarea
              className="input-base min-h-24 w-full resize-none font-mono text-xs"
              value={pix.qr_code ?? ''}
              readOnly
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={copied ? 'success' : 'secondary'}
              onClick={copyPix}
              leftIcon={copied ? <ShieldCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            >
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            <Button
              variant="secondary"
              loading={loadPix.isPending}
              onClick={() => loadPix.mutate()}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              Atualizar
            </Button>
          </div>

          <Button
            className="w-full"
            variant="danger"
            loading={cancelOrder.isPending}
            onClick={() => cancelOrder.mutate()}
            leftIcon={<XCircle className="h-4 w-4" />}
          >
            Cancelar pedido
          </Button>
        </div>
      )}

      {error && <div className="mt-3"><ErrorAlert message={error} /></div>}
    </Card>
  )
}

function CredentialsSection({ order, state }: { order: Order; state?: CustomerOrderState }) {
  const queryClient = useQueryClient()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [saved, setSaved] = useState(false)

  const saveCredentials = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('set_order_credentials', {
        p_order_id: order.id,
        p_login: login.trim(),
        p_password: password,
      })
      if (error) throw error
      const result = data as { success: boolean; error?: string; access_token?: string }
      if (!result.success) throw new Error(result.error ?? 'Erro ao salvar')
    },
    onSuccess: () => {
      setSaved(true)
      setLogin('')
      setPassword('')
      queryClient.invalidateQueries({ queryKey: ['order', order.id] })
      queryClient.invalidateQueries({ queryKey: ['customer-order-state', order.id] })
      setTimeout(() => setSaved(false), 3000)
    },
  })

  if (!state?.requires_credentials) return null

  const canSet = state.can_submit_credentials === true
  if (!canSet && !state.credentials_set) return null

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
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Ex: SeuUsuario#BR1"
              className="input-base w-full text-sm"
              autoComplete="username"
              maxLength={160}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-secondary block mb-1">Senha da conta</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-base w-full text-sm"
              autoComplete="new-password"
              maxLength={256}
            />
            <p className="text-[10px] text-ink-muted mt-1">
              O valor enviado é transformado em payload criptografado no banco. Não compartilhe a senha no chat.
            </p>
          </div>
          <Button
            size="sm"
            className="w-full"
            loading={saveCredentials.isPending}
            disabled={!login.trim() || password.length < 4}
            onClick={() => saveCredentials.mutate()}
            variant={saved ? 'success' : 'primary'}
          >
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

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const currency = useCurrency()

  const { data: order, isLoading, isError, refetch } = useOrder(id!)
  const { data: history } = useOrderHistory(id!)
  const { data: customerState } = useQuery({
    queryKey: ['customer-order-state', id],
    queryFn: () => getCustomerOrderState(id!),
    enabled: !!id,
  })

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
    <div className="max-w-4xl space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )

  if (isError) {
    return (
      <div className="max-w-4xl space-y-4">
        <ErrorAlert message="Não foi possível carregar o pedido. Tente novamente." />
        <Button onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="max-w-4xl space-y-4">
        <ErrorAlert message="Pedido não encontrado." />
        <Button onClick={() => navigate('/orders')}>Voltar para meus pedidos</Button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link to="/orders"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-ink">
              {t('customer.order.id', { id: order.id.slice(0, 8).toUpperCase() })}
            </h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-ink-secondary mt-0.5">
            {t('customer.order.created', { date: formatDateTime(order.created_at) })}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-5">
          {/* Order details */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-4">{t('customer.order.details')}</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: t('customer.order.service'),     value: getServiceLabel(order.service_id as string) },
                { label: t('customer.order.queue'),       value: order.queue_type === 'solo_duo' ? t('customer.order.soloQueue') : t('customer.order.flexQueue') },
                ...(order.service_id === 'elo_boost' && !order.pdl_bracket
                  ? [{ label: 'Modo', value: order.boost_mode === 'duo' ? 'Duo Boost' : 'Solo Boost' }]
                  : []),
                {
                  label: t('customer.order.currentRank'),
                  value: order.current_rank ? formatRank(
                    (order.current_rank as { tier: string }).tier as never,
                    (order.current_rank as { division: string }).division
                  ) : '—',
                },
                {
                  label: t('customer.order.targetRank'),
                  value: order.target_rank ? formatRank(
                    (order.target_rank as { tier: string }).tier as never,
                    (order.target_rank as { division: string }).division
                  ) : '—',
                },
                ...(order.pdl_bracket ? [
                  { label: 'PDL Atual', value: `${order.current_pdl ?? '—'} PDL` },
                  { label: 'Méd. PDL Ganho/Vitória', value: order.avg_pdl_gain != null ? `+${order.avg_pdl_gain} PDL` : '—' },
                  { label: 'Méd. PDL Perdido/Derrota', value: order.avg_pdl_loss != null ? `−${order.avg_pdl_loss} PDL` : '—' },
                ] : []),
                { label: t('customer.order.totalPaid'),   value: currency(order.total_price) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-ink-muted">{label}</p>
                  <p className="text-sm font-semibold text-ink mt-0.5 capitalize">{value}</p>
                </div>
              ))}
            </div>

            {order.extras?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-bg-elevated">
                <p className="text-xs text-ink-muted mb-2">Extras</p>
                <div className="space-y-1.5">
                  {sortOrderExtras(order.extras).map((extra) => (
                    <div key={extra.extra_id} className="flex items-center justify-between text-sm">
                      <span className="text-ink-secondary">{extra.name}</span>
                      <span className="font-semibold text-ink">{currency(extra.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {order.customer_notes && (
              <div className="mt-4 pt-4 border-t border-bg-elevated">
                <p className="text-xs text-ink-muted mb-1">{t('customer.order.notes')}</p>
                <p className="text-sm text-ink-secondary">{order.customer_notes}</p>
              </div>
            )}
          </Card>

          <OrderChat orderId={order.id} viewerRole="customer" />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <PendingPaymentSection order={order} />

          {/* Credenciais */}
          <CredentialsSection order={order} state={customerState} />

          <Card padding="md">
            <h3 className="text-sm font-semibold text-ink mb-4">{t('customer.order.timeline')}</h3>
            {!history?.length ? (
              <p className="text-xs text-ink-muted">{t('customer.order.noHistory')}</p>
            ) : (
              <div className="relative">
                <div className="absolute left-3.5 top-4 bottom-4 w-px bg-bg-elevated" />
                <div className="space-y-4">
                  {history.map((entry, idx) => (
                    <div key={entry.id} className="flex items-start gap-4 relative">
                      <div className={`h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 z-10 ${
                        idx === history.length - 1
                          ? 'border-brand bg-brand'
                          : 'border-bg-elevated bg-bg-surface'
                      }`}>
                        <Clock className="h-3 w-3 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-ink">
                          {ORDER_STATUS_LABEL[entry.to_status] ?? entry.to_status.replace(/_/g, ' ')}
                        </p>
                        <p className="text-[10px] text-ink-muted mt-0.5">
                          {timeAgo(entry.created_at)}
                        </p>
                        {entry.reason && (
                          <p className="text-xs text-ink-secondary mt-0.5">{entry.reason}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

        </div>
      </div>
    </div>
  )
}
