import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { order_id, amount, currency, success_url, cancel_url } = await req.json()

    // Verify the request comes from an authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    // Verify the order belongs to this user
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, customer_id, total_price, status')
      .eq('id', order_id)
      .single()

    if (orderError || !order) throw new Error('Order not found')
    if (order.customer_id !== user.id) throw new Error('Order does not belong to you')
    if (order.status !== 'awaiting_payment') throw new Error('Order is not awaiting payment')

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: currency ?? 'brl',
          product_data: {
            name: `EloBoost Order #${order_id.slice(0, 8).toUpperCase()}`,
            description: 'Professional boosting service — 100% completion guarantee',
          },
          unit_amount: Math.round(amount), // already in cents
        },
        quantity: 1,
      }],
      success_url,
      cancel_url,
      metadata: {
        order_id,
        customer_id: user.id,
      },
      payment_intent_data: {
        metadata: { order_id, customer_id: user.id },
      },
      customer_email: user.email,
    })

    // Pre-create payment record
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await serviceSupabase.from('payments').insert({
      order_id,
      customer_id: user.id,
      stripe_payment_intent_id: (session.payment_intent as string) ?? session.id,
      stripe_checkout_session_id: session.id,
      amount: amount / 100,
      currency: currency ?? 'brl',
      status: 'pending',
    })

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
