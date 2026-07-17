import { supabase } from '@/lib/supabase'
import { normalizeApiError } from '@/api/core/errors'
import type { BoosterProfile } from '@/types'
import type { BoosterAccessState, BoosterPerformanceSegment, ProfessionalProfileData, TopBoosterEntry } from './types'

export async function getBoosterAccessState(userId: string): Promise<BoosterAccessState> {
  const { data, error } = await supabase
    .from('booster_profiles')
    .select('status, display_name')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return 'error'
  if (!data) return 'no_application'
  if (data.status === 'approved') return 'approved'
  if (data.status === 'rejected') return 'rejected'
  return 'pending' // pending | under_review | suspended tratados como "aguardando" na UI
}

export async function getOwnProfessionalProfile(userId: string): Promise<ProfessionalProfileData | null> {
  const { data, error } = await supabase
    .from('booster_profiles')
    .select('display_name, display_name_changed_at, bio, lanes, specialties, peak_rank, opgg_link, available_days, hours_per_day_min, hours_per_day_max')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw normalizeApiError(error)
  return data as unknown as ProfessionalProfileData | null
}

export async function getOwnBoosterProfileId(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('booster_profiles').select('id').eq('user_id', userId).maybeSingle()
  if (error) throw normalizeApiError(error)
  return data?.id ?? null
}

export async function listPublicBoosters(): Promise<BoosterProfile[]> {
  const { data, error } = await supabase.from('public_booster_profiles').select('*').limit(100)
  if (error) throw normalizeApiError(error)
  return (data ?? []) as unknown as BoosterProfile[]
}

export async function getPublicBooster(boosterId: string): Promise<BoosterProfile | null> {
  const { data, error } = await supabase.from('public_booster_profiles').select('*').eq('id', boosterId).maybeSingle()
  if (error) throw normalizeApiError(error)
  return data as unknown as BoosterProfile | null
}

export async function listBoostersPerformance(boosterUserIds: string[]): Promise<BoosterPerformanceSegment[]> {
  if (boosterUserIds.length === 0) return []
  const { data, error } = await supabase
    .from('booster_performance_segments')
    .select('booster_id, adjusted_win_rate, total_matches')
    .in('booster_id', boosterUserIds)
    .eq('service_type', '__all__')
    .eq('rank_bucket', '__all__')
  if (error) throw normalizeApiError(error)
  return (data ?? []) as unknown as BoosterPerformanceSegment[]
}

export async function getBoosterPerformanceByRank(boosterUserId: string): Promise<BoosterPerformanceSegment[]> {
  const { data, error } = await supabase
    .from('booster_performance_segments')
    .select('rank_bucket, average_kda, adjusted_win_rate, total_matches')
    .eq('booster_id', boosterUserId)
    .eq('service_type', '__all__')
    .neq('rank_bucket', '__all__')
  if (error) throw normalizeApiError(error)
  return (data ?? []) as unknown as BoosterPerformanceSegment[]
}

export async function getTopBoosters(params: { limit: number; serviceType?: string; rankBucket?: string }): Promise<TopBoosterEntry[]> {
  const { data, error } = await supabase.rpc('get_top_boosters', {
    p_limit: params.limit,
    p_service_type: params.serviceType ?? '__all__',
    p_rank_bucket: params.rankBucket ?? '__all__',
  })
  if (error) throw normalizeApiError(error)
  const result = data as unknown as { success: boolean; boosters?: TopBoosterEntry[] }
  return result.boosters ?? []
}

export async function listAdminBoosters(status?: string): Promise<BoosterProfile[]> {
  let query = supabase.from('booster_profiles').select('*').order('created_at', { ascending: false }).limit(100)
  if (status && status !== 'all') query = query.eq('status', status as never)
  const { data, error } = await query
  if (error) throw normalizeApiError(error)
  return (data ?? []) as unknown as BoosterProfile[]
}

export async function getAdminBoosterDetail(boosterId: string): Promise<BoosterProfile> {
  const { data, error } = await supabase.from('booster_profiles').select('*').eq('id', boosterId).single()
  if (error) throw normalizeApiError(error)
  return data as unknown as BoosterProfile
}

export async function listBoosterAuditLog(boosterProfileId: string, limit = 20) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, actor_id, actor_role, action, created_at')
    .eq('entity_type', 'booster_profile')
    .eq('entity_id', boosterProfileId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw normalizeApiError(error)
  return data ?? []
}

export async function listBoosterNames(boosterUserIds: string[]): Promise<Map<string, { id: string; user_id: string; display_name: string }>> {
  if (boosterUserIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('booster_profiles')
    .select('id, user_id, display_name')
    .in('user_id', boosterUserIds)
  if (error) throw normalizeApiError(error)
  return new Map((data ?? []).map((b) => [b.user_id, b]))
}
