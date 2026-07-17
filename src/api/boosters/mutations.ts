import { supabase } from '@/lib/supabase'
import { assertRpcSuccess, normalizeApiError } from '@/api/core/errors'
import type { OnboardBoosterParams, UpdateProfessionalProfileParams } from './types'

export async function boosterHeartbeat(): Promise<void> {
  // Fire-and-forget por design -- uma falha ocasional de heartbeat não deve
  // incomodar o booster com um toast de erro.
  await supabase.rpc('booster_heartbeat')
}

export async function requestBoosterRole() {
  const { data, error } = await supabase.rpc('request_booster_role')
  if (error) throw normalizeApiError(error)
  return data as { success?: boolean } | null
}

export async function onboardBooster(params: OnboardBoosterParams) {
  // onboard_booster tem 3 sobrecargas históricas (migrations sucessivas
  // adicionaram full_name/cpf/available_days) -- a resolução de sobrecarga
  // do TS não infere bem um objeto com todos os campos opcionais presentes,
  // então o payload é montado tipado e só convertido no boundary da chamada.
  const args = {
    p_display_name: params.displayName,
    p_bio: params.bio,
    p_peak_rank: params.peakRank,
    p_opgg_link: params.opggLink,
    p_hours_per_day_min: params.hoursPerDayMin,
    p_hours_per_day_max: params.hoursPerDayMax,
    p_full_name: params.fullName,
    p_cpf: params.cpf,
    p_available_days: params.availableDays,
  }
  const { data, error } = await supabase.rpc('onboard_booster', args as never)
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string })
}

export async function updateProfessionalProfile(params: UpdateProfessionalProfileParams) {
  const { data, error } = await supabase.rpc('update_booster_professional_profile', {
    p_display_name: params.displayName,
    p_bio: params.bio,
    p_lanes: params.lanes,
    p_specialties: params.specialties,
    p_peak_tier: params.peakTier,
    p_opgg_link: params.opggLink,
    p_available_days: params.availableDays,
    p_hours_per_day_min: params.hoursPerDayMin,
    p_hours_per_day_max: params.hoursPerDayMax,
  })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string })
}

export async function adminApproveBooster(params: { boosterId: string; newStatus: 'approved' | 'rejected' | 'suspended' }) {
  const { data, error } = await supabase.rpc('approve_booster', { p_booster_id: params.boosterId, p_new_status: params.newStatus })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string })
}

export async function adminToggleBoosterTop3(params: { boosterId: string; isTop3: boolean }) {
  const { data, error } = await supabase.rpc('toggle_booster_top3', { p_booster_id: params.boosterId, p_is_top3: params.isTop3 })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string })
}
