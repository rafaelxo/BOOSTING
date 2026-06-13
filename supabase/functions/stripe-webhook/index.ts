import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing signature', { status: 400 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Idempotency: skip if we've already processed this event
  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('webhook_event_id', event.id)
    .single()

  if (existing) {
    console.log('Duplicate webhook event — skipping:', event.id)
    return new Response('OK', { status: 200 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'payment_intent.succeeded': {
        const obj = event.data.object as Stripe.PaymentIntent | Stripe.Checkout.Session
        const orderId = obj.metadata?.order_id
        const customerId = obj.metadata?.customer_id

        if (!orderId) break

        // Update payment record
        await supabase
          .from('payments')
          .update({
            status: 'paid',
            webhook_event_id: event.id,
            updated_at: new Date().toISOString(),
          })
          .eq('order_id', orderId)

        // Transition order to paid / awaiting_assignment
        const { data: order } = await supabase
          .from('orders')
          .select('id, status')
          .eq('id', orderId)
          .single()

        if (order && order.status === 'awaiting_payment') {
          await supabase
            .from('orders')
            .update({
              status: 'awaiting_assignment',
              stripe_payment_status: 'paid',
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderId)

          // Log status history
          await supabase.from('order_status_history').insert({
            order_id: orderId,
            from_status: 'awaiting_payment',
            to_status: 'awaiting_assignment',
            changed_by: customerId,
            reason: 'Payment confirmed via Stripe webhook',
          })

          // Notify customer
          if (customerId) {
            await supabase.from('notifications').insert({
              user_id: customerId,
              type: 'payment_confirmed',
              title: 'Payment Confirmed',
              body: `Your order #${orderId.slice(0, 8).toUpperCase()} has been paid and is now in the queue.`,
              data: { order_id: orderId },
            })
          }
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        const orderId = pi.metadata?.order_id
        if (!orderId) break

        await supabase
          .from('payments')
          .update({ status: 'failed', webhook_event_id: event.id, updated_at: new Date().toISOString() })
          .eq('order_id', orderId)
        break
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute
        const pi = dispute.payment_intent as string

        const { data: payment } = await supabase
          .from('payments')
          .select('order_id, customer_id')
          .eq('stripe_payment_intent_id', pi)
          .single()

        if (payment) {
          await supabase
            .from('orders')
            .update({ status: 'disputed', updated_at: new Date().toISOString() })
            .eq('id', payment.order_id)

          await supabase
            .from('payments')
            .update({ status: 'disputed', webhook_event_id: event.id })
            .eq('stripe_payment_intent_id', pi)
        }
        break
      }

      case 'refund.created': {
        const refund = event.data.object as Stripe.Refund
        // Refund records are created via admin action before this webhook fires
        // Just confirm the status here
        await supabase
          .from('refunds')
          .update({ status: 'succeeded' })
          .eq('stripe_refund_id', refund.id)
        break
      }

      default:
        console.log('Unhandled event type:', event.type)
    }
  } catch (err) {
    console.error('Error processing webhook:', err)
    return new Response('Processing error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
})
