import { useState } from 'react'
import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'
import { useCurrency } from '@/hooks/useCurrency'
import { Lock, CreditCard, ShieldCheck } from 'lucide-react'

export function StepPayment() {
  const { profile } = useAuthStore()
  const store = useOrderBuilderStore()
  const currency = useCurrency()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Recompute extrasPrice fresh (avoids stale value if user skipped the Extras step
  // after changing rank in Configure)
  const freshExtrasPrice = Math.round(
    store.selectedExtras.reduce((sum, { extra }) => {
      if (extra.price_modifier > 0) return sum + extra.price_modifier
      if (extra.price_modifier_pct > 0) return sum + (store.basePrice * extra.price_modifier_pct) / 100
      return sum
    }, 0) * 100
  ) / 100

  const totalPrice = store.basePrice + freshExtrasPrice

  async function handleCheckout() {
    if (!profile) return

    setIsProcessing(true)
    setError(null)

    try {
      // 1. Create the order record in DB
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: profile.id,
          service_id: store.serviceId ?? store.serviceType ?? '',
          game_id: store.gameId ?? store.gameSlug ?? '',
          status: 'awaiting_payment',
          queue_type: store.queueType,
          server: store.server,
          current_rank: store.currentRank as never,
          target_rank: store.targetRank as never,
          wins_purchased: store.winsPurchased,
          sessions_purchased: store.sessionsPurchased,
          extras: store.selectedExtras.map(({ extra }) => ({
            extra_id: extra.id,
            name: extra.name,
            price: extra.price_modifier > 0
              ? extra.price_modifier
              : Math.round(store.basePrice * extra.price_modifier_pct) / 100,
          })) as never,
          base_price: store.basePrice,
          extras_price: freshExtrasPrice,
          total_price: totalPrice,
          estimated_hours: store.estimatedHours,
          customer_notes: store.customerNotes || null,
          booster_notes: null,
          assigned_booster_id: null,
          stripe_payment_intent_id: null,
          stripe_payment_status: null,
          completed_at: null,
        })
        .select()
        .single()

      if (orderError) throw orderError

      // 2. Create Stripe Checkout Session via Supabase Edge Function
      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
        'create-checkout-session',
        {
          body: {
            order_id: order.id,
            amount: Math.round(totalPrice * 100), // in cents
            currency: 'usd',
            success_url: `${window.location.origin}/orders/${order.id}?payment=success`,
            cancel_url: `${window.location.origin}/orders/new`,
          },
        }
      )

      if (checkoutError) throw checkoutError

      // 3. Redirect to Stripe Checkout
      if (checkoutData?.url) {
        store.reset()
        window.location.href = checkoutData.url
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar o checkout. Tente novamente.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">Pagamento Seguro</h2>
      <p className="text-sm text-ink-secondary mb-6">
        Você será redirecionado ao checkout seguro do Stripe para concluir o pagamento.
      </p>

      <div className="space-y-5">
        {/* Order total */}
        <div className="card-brand p-5 flex items-center justify-between rounded-2xl">
          <div>
            <p className="text-xs text-ink-secondary">Total do Pedido</p>
            <p className="text-2xl font-extrabold text-ink mt-0.5">{currency(totalPrice)}</p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-brand flex items-center justify-center shadow-brand">
            <CreditCard className="h-6 w-6 text-white" />
          </div>
        </div>

        {/* Security notes */}
        <div className="space-y-3">
          {[
            { icon: Lock, text: 'Seus dados de cartão são criptografados de ponta a ponta e processados pelo Stripe.' },
            { icon: ShieldCheck, text: 'Nunca armazenamos seu número de cartão, CVV ou validade em nossos servidores.' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-2.5 text-xs text-ink-secondary">
              <Icon className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
              {text}
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger/10 rounded-xl px-4 py-3">{error}</p>
        )}

        <Button
          size="lg"
          className="w-full"
          loading={isProcessing}
          onClick={handleCheckout}
          leftIcon={<Lock className="h-4 w-4" />}
        >
          Pagar {currency(totalPrice)} — Checkout Seguro
        </Button>

        <p className="text-xs text-ink-muted text-center">
          Powered by Stripe. Processamento de pagamento em conformidade com PCI-DSS.
        </p>
      </div>
    </div>
  )
}
