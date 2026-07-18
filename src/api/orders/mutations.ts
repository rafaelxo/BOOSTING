import { supabase } from '@/lib/supabase'
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction'
import { assertRpcSuccess, normalizeApiError } from '@/api/core/errors'
import type { OrderStatus } from '@/types'
import type { OrderIntent, PixPaymentResponse } from './types'

export async function setOrderCredentials(params: { orderId: string; login: string; password: string }) {
  const { data, error } = await supabase.rpc('set_order_credentials', {
    p_order_id: params.orderId, p_login: params.login, p_password: params.password,
  })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string; access_token?: string }, {
    invalid_status: 'O pedido não está mais em um status que aceita credenciais.',
  })
}

export async function confirmOrderCompletion(orderId: string) {
  const { data, error } = await supabase.rpc('confirm_order_completion', { p_order_id: orderId })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string })
}

export async function disputeOrderCompletion(params: { orderId: string; reason: string }) {
  const { data, error } = await supabase.rpc('dispute_order_completion', {
    p_order_id: params.orderId, p_reason: params.reason,
  })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string })
}

export async function updateOrderStatus(params: { orderId: string; newStatus: OrderStatus }) {
  const { data, error } = await supabase.rpc('update_order_status', {
    p_order_id: params.orderId, p_new_status: params.newStatus,
  })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string }, {
    objective_not_reached: 'O rank alvo ainda não foi atingido.',
  })
}

export async function adminOverrideOrderStatus(params: { orderId: string; newStatus: OrderStatus; reason?: string }) {
  const { data, error } = await supabase.rpc('admin_override_order_status', {
    p_order_id: params.orderId, p_new_status: params.newStatus, p_reason: params.reason,
  })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string })
}

export async function adminDropOrder(params: { orderId: string; reason: string }) {
  const { data, error } = await supabase.rpc('admin_drop_order', { p_order_id: params.orderId, p_reason: params.reason })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string })
}

export async function requestOrderDrop(params: { orderId: string; reason: string }) {
  const { data, error } = await supabase.rpc('request_order_drop', { p_order_id: params.orderId, p_reason: params.reason })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string; penalty_pct?: number; penalty_amount?: number })
}

export interface RequestOrderSupportResult {
  success: boolean
  error?: string
  escalation_id?: string
  already_open?: boolean
  deadline_at?: string
  delay_minutes?: number
  discord_voice_channel_id?: string | null
}

const SUPPORT_ESCALATION_MESSAGES: Record<string, string> = {
  order_not_active: 'Este pedido não está mais ativo.',
  no_deadline_yet: 'O prazo deste pedido ainda não começou a contar.',
  not_late_yet: 'Este pedido ainda está dentro do prazo estimado.',
}

export async function requestOrderSupport(orderId: string): Promise<RequestOrderSupportResult> {
  const { data, error } = await supabase.rpc('request_order_support', { p_order_id: orderId })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as unknown as RequestOrderSupportResult, SUPPORT_ESCALATION_MESSAGES)
}

export async function revealOrderCredentials(orderId: string) {
  const { data, error } = await supabase.rpc('get_order_credentials', { p_order_id: orderId })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string; access_token?: string })
}

const ACCEPT_ORDER_MESSAGES: Record<string, string> = {
  order_no_longer_available: 'Este pedido não está mais disponível.',
  slot_limit_reached: 'Você atingiu o limite de pedidos ativos.',
  duo_slot_limit_reached: 'Você atingiu o limite de pedidos Duo ativos.',
  exclusive_slot_already_used: 'Sua vaga exclusiva do mês já foi usada.',
  order_exclusive_to_another_booster: 'Este pedido é exclusivo para outro booster no momento.',
  booster_not_approved: 'Sua conta de booster ainda não está aprovada.',
  unauthorized: 'Sua sessão expirou. Entre novamente para continuar.',
}

export async function acceptBoostOrder(params: { orderId: string; boosterId: string }) {
  const { data, error } = await supabase.rpc('accept_boost_order', {
    p_order_id: params.orderId, p_booster_user_id: params.boosterId,
  })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string }, ACCEPT_ORDER_MESSAGES)
}

export async function savePendingOrderFromIntent(params: {
  intent: OrderIntent
  idempotencyKey: string
  preferredBoosterId?: string
}): Promise<PixPaymentResponse> {
  return invokeEdgeFunction<PixPaymentResponse>('create-pix-payment', {
    body: {
      intent: params.intent, idempotency_key: params.idempotencyKey,
      preferred_booster_id: params.preferredBoosterId, save_only: true,
    },
    timeoutMs: 25_000,
    requireAuth: true,
  })
}

export async function generatePix(orderId: string): Promise<PixPaymentResponse> {
  return invokeEdgeFunction<PixPaymentResponse>('create-pix-payment', {
    body: { order_id: orderId },
    timeoutMs: 25_000,
    requireAuth: true,
  })
}

export async function cancelPendingOrder(orderId: string): Promise<void> {
  await invokeEdgeFunction('cancel-pending-order', {
    body: { order_id: orderId },
    timeoutMs: 20_000,
    requireAuth: true,
  })
}

export interface SyncOrderMatchesResult {
  synced: boolean
  reason?: string
  new_matches?: number
}

export async function syncOrderMatches(orderId: string): Promise<SyncOrderMatchesResult> {
  return invokeEdgeFunction<SyncOrderMatchesResult>('sync-order-matches', {
    body: { order_id: orderId },
    timeoutMs: 25_000,
    requireAuth: true,
  })
}

export interface VerifyOrderRankResult {
  passed: boolean
  reason?: string
  fetched_tier?: string
  fetched_division?: string | null
  target_tier?: string
  target_division?: string | null
}

export async function verifyOrderRank(orderId: string): Promise<VerifyOrderRankResult> {
  return invokeEdgeFunction<VerifyOrderRankResult>('verify-order-rank', {
    body: { order_id: orderId },
    requireAuth: true,
  })
}
