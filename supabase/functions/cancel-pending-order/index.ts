import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { z } from 'https://esm.sh/zod@3.23.8'
import { handleCors } from '../_shared/cors.ts'
import { errorResponse, jsonResponse, rateLimitResponse } from '../_shared/responses.ts'
import { getAuthUser } from '../_shared/authUser.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { fetchWithTimeout, HttpError, readJsonBody } from '../_shared/http.ts'
import { consumeUserRateLimit } from '../_shared/rateLimit.ts'

const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') ?? ''
const MP_API_BASE = 'https://api.mercadopago.com'

const bodySchema = z.object({
  order_id: z.string().uuid(),
}).strict()

type MercadoPagoPayment = {
  id: string | number
  status: string
  external_reference?: string | null
}

async function fetchPayment(paymentId: string): Promise<MercadoPagoPayment> {
  if (!MP_ACCESS_TOKEN) throw new Error('MERCADOPAGO_ACCESS_TOKEN is not set')
  const response = await fetchWithTimeout(`${MP_API_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  })
  if (!response.ok) throw new Error(`Mercado Pago fetch failed with ${response.status}`)
  return await response.json() as MercadoPagoPayment
}

async function cancelPayment(paymentId: string): Promise<boolean> {
  if (!MP_ACCESS_TOKEN) return false
  const response = await fetchWithTimeout(`${MP_API_BASE}/v1/payments/${paymentId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'cancelled' }),
  })
  return response.ok
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== 'POST') return errorResponse(req, 'Method not allowed', 405, 'METHOD_NOT_ALLOWED')

    const auth = await getAuthUser(req.headers.get('Authorization'))
    if (!auth) return errorResponse(req, 'Unauthorized', 401, 'UNAUTHORIZED')

    const rateLimit = await consumeUserRateLimit('cancel-pending-order', auth.user.id, 10, 60)
    if (!rateLimit.allowed) return rateLimitResponse(req, rateLimit.retryAfter)

    const parsedBody = bodySchema.safeParse(await readJsonBody(req, 8 * 1024))
    if (!parsedBody.success) {
      return jsonResponse(req, {
        success: false,
        code: 'INVALID_BODY',
        error: 'Body inválido',
        issues: parsedBody.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      }, 400)
    }

    const { order_id } = parsedBody.data
    const admin = supabaseAdmin()

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, customer_id, status, mp_payment_id')
      .eq('id', order_id)
      .maybeSingle()

    if (orderError) return errorResponse(req, 'Failed to load order', 500, 'ORDER_LOAD_FAILED')
    if (!order) return errorResponse(req, 'Order not found', 404, 'ORDER_NOT_FOUND')
    if (order.customer_id !== auth.user.id) return errorResponse(req, 'Forbidden', 403, 'ORDER_FORBIDDEN')
    if (order.status !== 'awaiting_payment') {
      return errorResponse(req, 'Only awaiting payment orders can be cancelled here', 409, 'ORDER_NOT_AWAITING_PAYMENT')
    }

    if (order.mp_payment_id) {
      let payment: MercadoPagoPayment
      try {
        payment = await fetchPayment(order.mp_payment_id)
      } catch (err) {
        console.error('Unable to fetch provider payment before cancellation', err instanceof Error ? err.message : 'unknown')
        return errorResponse(req, 'Unable to verify provider payment', 502, 'PAYMENT_PROVIDER_LOOKUP_FAILED')
      }

      if (payment.external_reference && payment.external_reference !== order.id) {
        return errorResponse(req, 'Payment/order mismatch', 409, 'PAYMENT_ORDER_MISMATCH')
      }

      if (payment.status === 'approved') {
        return errorResponse(req, 'Payment already approved', 409, 'PAYMENT_ALREADY_APPROVED')
      }

      if (['pending', 'in_process', 'authorized'].includes(payment.status)) {
        const cancelled = await cancelPayment(order.mp_payment_id)
        if (!cancelled) {
          return errorResponse(req, 'Unable to cancel provider payment', 502, 'PAYMENT_PROVIDER_CANCEL_FAILED')
        }
      }
    }

    // payments.order_id is not ON DELETE CASCADE, so remove it explicitly.
    const { error: deletePaymentsError } = await admin
      .from('payments')
      .delete()
      .eq('order_id', order.id)
      .eq('customer_id', auth.user.id)

    if (deletePaymentsError) return errorResponse(req, 'Failed to delete payment record', 500, 'PAYMENT_DELETE_FAILED')

    const { error: deleteOrderError } = await admin
      .from('orders')
      .delete()
      .eq('id', order.id)
      .eq('customer_id', auth.user.id)
      .eq('status', 'awaiting_payment')

    if (deleteOrderError) return errorResponse(req, 'Failed to delete order', 500, 'ORDER_DELETE_FAILED')

    return jsonResponse(req, { success: true, order_id: order.id, deleted: true })
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(req, err.message, err.status)
    console.error('cancel-pending-order error', err instanceof Error ? err.name : 'unknown')
    return errorResponse(req, 'Internal server error', 500, 'INTERNAL_ERROR')
  }
})
