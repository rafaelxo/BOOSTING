import { supabase } from '@/lib/supabase'
import type { OrderStatus } from '@/types'

export type CustomerOrderState = {
  success: boolean
  error?: string
  order_id: string | null
  status?: OrderStatus
  payment_status?: string | null
  can_pay?: boolean
  payment_confirmed?: boolean
  requires_credentials?: boolean
  credentials_set?: boolean
  can_submit_credentials?: boolean
  can_confirm_completion?: boolean
}

export async function getCustomerOrderState(orderId?: string): Promise<CustomerOrderState> {
  const { data, error } = await supabase.rpc('get_customer_order_state', {
    p_order_id: orderId,
  })
  if (error) throw error
  const state = data as CustomerOrderState | null
  if (!state?.success) throw new Error(state?.error ?? 'Não foi possível validar o estado do pedido.')
  return state
}
