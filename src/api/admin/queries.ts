import { supabase } from '@/lib/supabase'
import { normalizeApiError } from '@/api/core/errors'
import type { OrderDropRequest, Payment, Refund } from '@/types'
import type { AdminDashboardStats } from './types'

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const { data, error } = await supabase.rpc('admin_dashboard_stats')
  if (error) throw normalizeApiError(error)
  return data as unknown as AdminDashboardStats
}

export async function listAdminRefunds(limit = 100): Promise<Refund[]> {
  const { data, error } = await supabase.from('refunds').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw normalizeApiError(error)
  return (data ?? []) as unknown as Refund[]
}

export async function listAdminPayments(limit = 150): Promise<Payment[]> {
  const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw normalizeApiError(error)
  return (data ?? []) as unknown as Payment[]
}

export async function listAdminDropRequests(limit = 100): Promise<OrderDropRequest[]> {
  const { data, error } = await supabase
    .from('order_drop_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw normalizeApiError(error)
  return (data ?? []) as unknown as OrderDropRequest[]
}

export async function getOrderSupportEscalation(orderId: string) {
  const { data, error } = await supabase
    .from('order_support_escalations')
    .select('*')
    .eq('order_id', orderId)
    .eq('status', 'open')
    .maybeSingle()
  if (error) throw normalizeApiError(error)
  return data
}
