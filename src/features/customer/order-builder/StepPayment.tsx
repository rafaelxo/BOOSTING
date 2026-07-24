import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { useAuthStore } from '@/stores/authStore'
import { EdgeFunctionError, invokeEdgeFunction } from '@/lib/invokeEdgeFunction'
import { Button, ErrorAlert } from '@/components/ui'
import { useCurrency } from '@/hooks/useCurrency'
import { useBoostAddons, EMPTY_ADDONS } from '@/hooks/useBoostAddons'
import { getBoostFlow } from '@/lib/boostDomain'
import { isUuid } from '@/lib/utils'
import { getCustomerOrderState, savePendingOrderFromIntent, generatePix as generatePixRequest } from '@/api/orders'
import type { PixPaymentResponse } from '@/api/orders'
import { Copy, CheckCircle2, Clock, QrCode, ShieldCheck, Plus, Info } from 'lucide-react'

// PIX states
type PixState =
  | { phase: 'idle' }
  | { phase: 'generating' }
  | { phase: 'waiting'; qr_code: string; qr_base64: string | null; expires_at: string; payment_id: string; order_id: string; total_price: number }
  | { phase: 'confirmed' }
  | { phase: 'expired'; order_id: string }
  | { phase: 'error'; message: string; order_id?: string }

function pixErrorMessage(err: unknown) {
  if (!(err instanceof EdgeFunctionError)) {
    return err instanceof Error ? err.message : 'Erro ao gerar PIX'
  }

  if (err.code === 'NETWORK_ERROR') {
    return 'Não foi possível conectar à função de PIX. Verifique se o Vite foi reiniciado e se VITE_SUPABASE_URL está configurada.'
  }
  if (err.status === 401) {
    return 'Sua sessão expirou. Entre novamente para gerar o PIX.'
  }
  if (err.status === 403) {
    return `A função recusou a operação${err.code ? ` (${err.code})` : ''}. Entre novamente e tente outra vez.`
  }
  if (err.status >= 500) {
    return `A função de PIX falhou no servidor${err.code ? ` (${err.code})` : ''}: ${err.message}`
  }

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
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const safeRemaining = remaining ?? 0
  const mm = String(Math.floor(safeRemaining / 60)).padStart(2, '0')
  const ss = String(safeRemaining % 60).padStart(2, '0')
  return { remaining, label: `${mm}:${ss}` }
}

export function StepPayment() {
  const { profile } = useAuthStore()
  const store = useOrderBuilderStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const pendingOrderId = searchParams.get('order')
  const currency = useCurrency()
  const [pix, setPix] = useState<PixState>({ phase: 'idle' })
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [savedOrderId, setSavedOrderId] = useState<string | null>(pendingOrderId)
  const [savedTotalPrice, setSavedTotalPrice] = useState<number | null>(null)
  const [isSavingOrder, setIsSavingOrder] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)
  const qrRetryTimeoutRef = useRef<number | null>(null)
  const idempotencyKeyRef = useRef(crypto.randomUUID())
  const restoredOrderRef = useRef<string | null>(null)
  const expiryHandledRef = useRef(false)

  const flow = store.serviceType === 'elo_boost' && store.currentRank
    ? getBoostFlow(store.currentRank.tier, store.boostMode)
    : store.serviceType === 'win_boost' || store.serviceType === 'md5'
      ? 'solo_standard'
      : null
  // Mesma queryKey usada em StepExtras/StepReview — já em cache. Precisamos
  // do catálogo aqui só para traduzir os ids selecionados em códigos
  // estáveis (addon_codes) — o payload nunca envia o id interno do banco.
  const { data: addonData } = useBoostAddons(flow)
  const addonCatalog = addonData ?? EMPTY_ADDONS
  const addonCodes = addonCatalog
    .filter(e => store.selectedExtraIds.has(e.id))
    .map(e => e.code)
    .filter((code): code is string => !!code)
  const addonsReady = store.selectedExtraIds.size === 0 || addonData !== undefined

  // Estimativa exibida antes de gerar o PIX (mesma conta que StepReview já
  // mostrou ao cliente). O valor cobrado de fato é sempre o que a Edge
  // Function retorna, recomputado no servidor a partir de shared/pricing.ts.
  const estimatedTotal = store.basePrice + store.extrasPrice
  const totalPrice = pix.phase === 'waiting' ? pix.total_price : savedTotalPrice ?? estimatedTotal

  // OrderBuilder.tsx grava store.gameId/serviceId com o slug/tipo cru
  // ('lol', 'win_boost') até resolver os uuids reais de catálogo em segundo
  // plano; um clique antes disso terminar mandaria o slug pro backend, que
  // rejeita (.uuid() na Edge Function) — daí o bug de "só funciona no
  // segundo clique". Derivado direto do store (já subscrito acima), sem
  // precisar de um campo extra: fica correto assim que gameId/serviceId
  // virarem uuids de verdade, sem round-trip.
  const catalogReady = isUuid(store.gameId ?? '') && isUuid(store.serviceId ?? '')
  const expiresAt = pix.phase === 'waiting' ? pix.expires_at : null
  const { remaining, label: countdownLabel } = useCountdown(expiresAt)

  // At the provider expiration timestamp, cancel/delete the unpaid checkout
  // through the authenticated backend and return the configurator to step 1.
  useEffect(() => {
    if (pix.phase === 'waiting' && remaining === 0 && !expiryHandledRef.current) {
      expiryHandledRef.current = true
      const orderId = pix.order_id
      setPix({ phase: 'expired', order_id: orderId })
      stopPolling()

      void invokeEdgeFunction('cancel-pending-order', {
        body: { order_id: orderId },
        timeoutMs: 20_000,
        requireAuth: true,
      }).catch(async () => {
        // A confirmation can race the final second of the countdown. Never
        // discard a payment that the backend already marked as approved.
        const state = await getCustomerOrderState(orderId).catch(() => null)
        if (state?.payment_confirmed) {
          const requiresCredentials = state.requires_credentials === true
          setPix({ phase: 'confirmed' })
          store.reset()
          navigate(`/orders/${orderId}${requiresCredentials ? '#credentials' : ''}`, { replace: true })
          return true
        }
        return false
      }).then((paymentConfirmed) => {
        if (paymentConfirmed === true) return
        queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
        queryClient.invalidateQueries({ queryKey: ['resumable-customer-order'] })
        startNewOrder()
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, pix.phase])

  function stopPolling() {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function stopQrRetry() {
    if (qrRetryTimeoutRef.current !== null) {
      clearTimeout(qrRetryTimeoutRef.current)
      qrRetryTimeoutRef.current = null
    }
  }

  // Poll order status every 5s until confirmed or expired
  function startPolling(orderId: string) {
    stopPolling()
    pollRef.current = window.setInterval(async () => {
      const state = await getCustomerOrderState(orderId).catch(() => null)

      if (state?.payment_confirmed) {
        const requiresCredentials = state.requires_credentials === true
        stopPolling()
        setPix({ phase: 'confirmed' })
        store.reset()
        setTimeout(() => navigate(`/orders/${orderId}${requiresCredentials ? '#credentials' : ''}`), 2500)
      }
    }, 5000)
  }


  useEffect(() => () => { stopPolling(); stopQrRetry() }, [])

  function buildIntent(): Record<string, unknown> {
    const base = {
      service_type: store.serviceType,
      service_id: store.serviceId!,
      game_id: store.gameId!,
      queue_type: store.queueType,
      server: store.server,
      current_rank: store.currentRank,
      customer_notes: store.customerNotes || null,
    }

    if (store.serviceType === 'elo_boost') {
      return flow === 'master_plus'
        ? {
            ...base,
            target_rank: store.targetRank,
            boost_mode: 'solo',
            addon_codes: addonCodes,
            riot_id: store.riotId,
          }
        : {
            ...base,
            target_rank: store.targetRank,
            boost_mode: store.boostMode,
            addon_codes: addonCodes,
            win_package: store.winPackage,
            riot_id: store.riotId,
          }
    }

    if (store.serviceType === 'md5') {
      return {
        ...base,
        wins_purchased: store.winsPurchased,
        riot_id: store.riotId,
      }
    }

    return {
      ...base,
      target_rank: store.targetRank,
      boost_mode: store.boostMode,
      wins_purchased: store.winsPurchased,
      sessions_purchased: store.sessionsPurchased,
      addon_codes: addonCodes,
      win_package: store.winPackage,
      booster_service_id: store.selectedCoachPackage?.id ?? null,
      riot_id: store.serviceType === 'win_boost' ? store.riotId : null,
    }
  }

  async function persistPendingOrder(): Promise<string | null> {
    if (!profile || !catalogReady || !addonsReady) return null
    if (savedOrderId) return savedOrderId

    setIsSavingOrder(true)
    setSaveError(null)
    try {
      const saved = await savePendingOrderFromIntent({
        intent: buildIntent(),
        idempotencyKey: idempotencyKeyRef.current,
        preferredBoosterId: store.preferredBoosterId ?? undefined,
      })
      restoredOrderRef.current = saved.order_id
      setSavedOrderId(saved.order_id)
      setSavedTotalPrice(Number(saved.total_price))
      setSearchParams({ order: saved.order_id }, { replace: true })
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
      queryClient.invalidateQueries({ queryKey: ['resumable-customer-order'] })
      return saved.order_id
    } catch (err) {
      setSaveError(pixErrorMessage(err))
      return null
    } finally {
      setIsSavingOrder(false)
    }
  }

  // O pedido só é criado quando o cliente clica em "Gerar PIX" (ver
  // generatePix, que chama persistPendingOrder como parte do próprio clique)
  // -- nunca automaticamente ao entrar nesta etapa. Antes disso existia um
  // auto-save aqui que criava o pedido assim que a tela de pagamento abria,
  // mesmo sem o cliente pedir pra pagar; cada reconfiguração sem clicar em
  // "Gerar PIX" deixava um pedido órfão "Aguardando pagamento" em Meus
  // Pedidos -- essa era a causa real da duplicação, não só um problema de
  // exibição no dashboard.

  // Chama a Edge Function que cria (ou reaproveita) o pedido e gera o PIX.
  // O preço nunca é enviado pelo cliente — a function recomputa tudo a
  // partir da intenção (rank, extras selecionados, pacote de vitórias etc).
  async function invokePix(orderId: string) {
    let pixData: PixPaymentResponse

    try {
      pixData = await generatePixRequest(orderId)
    } catch (err) {
      const orderId = err instanceof EdgeFunctionError && err.body && typeof err.body !== 'string'
        ? typeof err.body.order_id === 'string' ? err.body.order_id : undefined
        : undefined
      setPix({ phase: 'error', message: pixErrorMessage(err), order_id: orderId })
      return
    }

    if (!pixData.qr_code) {
      setPix({ phase: 'error', message: 'A função não retornou o código PIX. Tente novamente.', order_id: pixData.order_id })
      return
    }

    setPix({
      phase: 'waiting',
      qr_code: pixData.qr_code,
      qr_base64: pixData.qr_code_base64 ?? null,
      expires_at: pixData.expires_at,
      payment_id: String(pixData.payment_id),
      order_id: orderId,
      total_price: Number(pixData.total_price),
    })
    setSearchParams({ order: orderId }, { replace: true })
    queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
    queryClient.invalidateQueries({ queryKey: ['resumable-customer-order'] })

    // If MP didn't return base64 yet, retry once after 3s to get it. Scoped
    // to this order (tracked in a ref, cancelled on unmount/next invokePix)
    // and only ever applied if the UI is still waiting on THIS SAME order --
    // a stray timer from a previous order's PIX must never patch whatever
    // order is currently being displayed.
    stopQrRetry()
    if (!pixData.qr_code_base64) {
      qrRetryTimeoutRef.current = window.setTimeout(async () => {
        const retry = await generatePixRequest(orderId).catch(() => null)
        if (retry?.qr_code_base64) {
          setPix((prev) =>
            prev.phase === 'waiting' && prev.order_id === orderId
              ? { ...prev, qr_base64: retry.qr_code_base64 ?? null }
              : prev,
          )
        }
      }, 3000)
    }

    startPolling(orderId)
  }

  // Ao voltar pra essa tela com um pedido já criado (?order=), reexibe o
  // MESMO qr code automaticamente em vez de exigir um novo clique em "Gerar
  // PIX" -- create-pix-payment reaproveita o pagamento PIX pendente
  // existente (nunca gera um segundo), então isso nunca duplica cobrança. Se
  // o pagamento já foi confirmado enquanto a aba estava fechada/em segundo
  // plano, pula direto pro pedido em vez de tentar gerar um PIX novo.
  useEffect(() => {
    if (!profile || !pendingOrderId || restoredOrderRef.current === pendingOrderId) return
    restoredOrderRef.current = pendingOrderId
    setSavedOrderId(pendingOrderId)
    setIsSavingOrder(true)
    void (async () => {
      const state = await getCustomerOrderState(pendingOrderId).catch(() => null)
      if (state?.payment_confirmed) {
        const requiresCredentials = state.requires_credentials === true
        navigate(`/orders/${pendingOrderId}${requiresCredentials ? '#credentials' : ''}`, { replace: true })
        return
      }
      setPix({ phase: 'generating' })
      await invokePix(pendingOrderId)
    })().catch((err) => {
      setSaveError(pixErrorMessage(err))
    }).finally(() => {
      setIsSavingOrder(false)
    })
    // Só na chegada do pendingOrderId -- invokePix/navigate são estáveis o
    // suficiente pro propósito deste efeito (roda uma vez por order id, via
    // o guard restoredOrderRef acima).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOrderId, profile])

  function startNewOrder() {
    stopPolling()
    stopQrRetry()
    store.reset()
    store.setStep('service')
    setSavedOrderId(null)
    setSavedTotalPrice(null)
    setSaveError(null)
    setPix({ phase: 'idle' })
    idempotencyKeyRef.current = crypto.randomUUID()
    expiryHandledRef.current = false
    setSearchParams({ new: '1' }, { replace: true })
  }

  async function generatePix() {
    if (!profile) return
    if (pix.phase === 'generating') return

    if (!catalogReady) {
      setPix({ phase: 'error', message: 'Ainda carregando o catálogo — aguarde um instante e tente novamente.' })
      return
    }

    try {
      const erroredOrderId = pix.phase === 'error' ? pix.order_id : undefined
      const orderId = erroredOrderId ?? savedOrderId ?? pendingOrderId ?? await persistPendingOrder()
      if (!orderId) return
      setPix({ phase: 'generating' })
      await invokePix(orderId)
    } catch (err) {
      setPix({ phase: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' })
    }
  }

  async function copyPix() {
    if (pix.phase !== 'waiting') return
    try {
      await navigator.clipboard.writeText(pix.qr_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      setCopyError('Não foi possível copiar automaticamente. Selecione o código acima e copie manualmente.')
      setTimeout(() => setCopyError(null), 4000)
    }
  }

  // ── Confirmed ────────────────────────────────────────────────────────────────
  if (pix.phase === 'confirmed') {
    return (
      <div className="text-center py-8">
        <div className="h-16 w-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
        <h2 className="text-xl font-bold text-ink mb-2">Pagamento Confirmado!</h2>
        <p className="text-sm text-ink-secondary">Pagamento aprovado. Redirecionando para os próximos passos…</p>
      </div>
    )
  }

  // ── Expired ──────────────────────────────────────────────────────────────────
  if (pix.phase === 'expired') {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto">
          <Clock className="h-8 w-8 text-danger" />
        </div>
        <h2 className="text-xl font-bold text-ink">PIX Expirado</h2>
        <p className="text-sm text-ink-secondary">O pedido não foi pago e está sendo cancelado. Reiniciando o configurador…</p>
      </div>
    )
  }

  // ── Waiting (QR code shown) ───────────────────────────────────────────────
  if (pix.phase === 'waiting') {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-bold text-ink mb-1">Pagar via PIX</h2>
          <p className="text-sm text-ink-secondary">
            Escaneie o QR code ou copie o código PIX no seu app de banco.
          </p>
        </div>

        {/* Amount + timer */}
        <div className="flex items-center justify-between bg-bg-elevated rounded-2xl px-5 py-4">
          <div>
            <p className="text-xs text-ink-muted">Total a pagar</p>
            <p className="text-2xl font-extrabold text-brand mt-0.5">{currency(totalPrice)}</p>
          </div>
          <div className={`flex items-center gap-1.5 text-sm font-bold ${(remaining ?? Number.POSITIVE_INFINITY) < 120 ? 'text-danger' : 'text-ink-secondary'}`}>
            <Clock className="h-4 w-4" />
            {countdownLabel}
          </div>
        </div>

        {/* QR code */}
        <div className="flex flex-col items-center gap-4">
          {pix.qr_base64 ? (
            <div className="p-3 bg-white rounded-2xl shadow-sm border border-bg-elevated">
              <img
                src={`data:image/png;base64,${pix.qr_base64}`}
                alt="QR Code PIX"
                className="w-52 h-52"
              />
            </div>
          ) : (
            <div className="w-52 h-52 bg-bg-elevated rounded-2xl flex flex-col items-center justify-center gap-2 text-center px-4">
              <QrCode className="h-12 w-12 text-ink-muted animate-pulse" />
              <p className="text-[11px] text-ink-muted">Gerando imagem do QR code… use o código copia-e-cola abaixo enquanto isso.</p>
            </div>
          )}
          <p className="text-xs text-ink-muted">Válido por 30 minutos</p>
        </div>

        {/* Copy code */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">
            Ou copie o código PIX Copia e Cola
          </p>
          <div className="flex gap-2">
            <div className="flex-1 bg-bg-elevated rounded-xl px-3 py-2.5 text-xs font-mono text-ink-secondary truncate">
              {pix.qr_code.slice(0, 60)}…
            </div>
            <Button
              size="sm"
              variant={copied ? 'success' : 'secondary'}
              leftIcon={copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              onClick={copyPix}
            >
              {copied ? 'Copiado!' : 'Copiar'}
            </Button>
          </div>
          {copyError && <p className="text-xs text-danger">{copyError}</p>}
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 text-xs text-ink-secondary bg-bg-surface border border-bg-elevated rounded-xl px-4 py-3">
          <div className="h-2 w-2 rounded-full bg-brand animate-pulse" />
          Aguardando confirmação do pagamento…
        </div>

        <p className="text-[11px] text-center text-ink-muted">
          Este pedido continuará salvo em Meus pedidos para você pagar depois.
        </p>

        {/* Security */}
        <div className="flex items-start gap-2.5 text-xs text-ink-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
          Pagamento processado com segurança pelo Mercado Pago. Seus dados bancários nunca passam por nossos servidores.
        </div>

        <div className="flex justify-center">
          <Button
            size="sm"
            variant="secondary"
            onClick={startNewOrder}
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            Configurar novo pedido
          </Button>
        </div>
      </div>
    )
  }

  // ── Idle / Generating (initial state) ────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-ink mb-1">Pagamento via PIX</h2>
        <p className="text-sm text-ink-secondary">
          Instantâneo, gratuito e 100% seguro. Pague em segundos pelo app do seu banco.
        </p>
      </div>

      {/* Seu pedido ainda não existe no banco neste ponto -- só é criado
          quando o cliente clica em "Gerar PIX" (ver comentário perto de
          persistPendingOrder). Deixa isso explícito antes que ele confunda
          "terminei de configurar" com "meu pedido tá salvo". */}
      <div className="flex items-start gap-2.5 rounded-xl border border-brand/25 bg-brand/10 px-4 py-3 text-xs text-ink-secondary">
        <Info className="h-4 w-4 text-brand shrink-0 mt-0.5" />
        <span>
          Para salvar seu pedido, clique em <strong className="text-ink">Gerar PIX</strong>. Depois disso, ele fica salvo em <strong className="text-ink">Meus Pedidos</strong>, aguardando pagamento.
        </span>
      </div>

      {/* Amount summary */}
      <div className="card-brand p-5 flex items-center justify-between rounded-2xl">
        <div>
          <p className="text-xs text-ink-secondary">Total do Pedido</p>
          <p className="text-2xl font-extrabold text-ink mt-0.5">{currency(totalPrice)}</p>
        </div>
        <div className="h-12 w-12 rounded-2xl bg-brand flex items-center justify-center shadow-brand">
          <QrCode className="h-6 w-6 text-white" />
        </div>
      </div>

      {/* How it works */}
      <div className="space-y-2">
        {[
          '1. Clique em "Gerar PIX" abaixo',
          '2. Escaneie o QR code ou copie o código no app do seu banco',
          '3. Confirme o pagamento — seu pedido entra na fila automaticamente',
        ].map((step) => (
          <div key={step} className="flex items-center gap-2.5 text-xs text-ink-secondary">
            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
            {step}
          </div>
        ))}
      </div>

      {pix.phase === 'error' && <ErrorAlert message={pix.message} />}
      {saveError && pix.phase !== 'error' && <ErrorAlert message={saveError} />}

      {savedOrderId && !saveError && (
        <p className="text-xs text-success text-center">
          Pedido salvo em Meus pedidos como Aguardando pagamento.
        </p>
      )}

      <div className="flex gap-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={startNewOrder}
          leftIcon={<Plus className="h-3.5 w-3.5" />}
        >
          Configurar novo pedido
        </Button>

        <Button
          className="flex-1"
          loading={pix.phase === 'generating'}
          onClick={generatePix}
          disabled={totalPrice <= 0 || !catalogReady || !addonsReady || isSavingOrder}
          leftIcon={<QrCode className="h-4 w-4" />}
        >
          {!catalogReady || !addonsReady
            ? 'Carregando catálogo…'
            : isSavingOrder
              ? 'Salvando pedido…'
              : pix.phase === 'generating'
                ? 'Gerando PIX…'
                : `Gerar PIX — ${currency(totalPrice)}`}
        </Button>
      </div>

      {totalPrice <= 0 && (
        <p className="text-xs text-danger text-center">Configure seu pedido para ver o preço.</p>
      )}

      <div className="flex items-start gap-2.5 text-xs text-ink-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
        Processado pelo Mercado Pago. Não armazenamos seus dados bancários.
      </div>
    </div>
  )
}
