import type { BoosterProfile, Rank } from '@/types'

export type { BoosterProfile }

export type BoosterAccessState = 'no_application' | 'pending' | 'approved' | 'rejected' | 'error'

export interface ProfessionalProfileData {
  display_name: string
  display_name_changed_at: string | null
  bio: string | null
  lanes: string[] | null
  specialties: string[] | null
  peak_rank: Rank | null
  opgg_link: string | null
  available_days: string[] | null
  hours_per_day_min: number | null
  hours_per_day_max: number | null
}

export interface OnboardBoosterParams {
  displayName: string
  bio: string
  peakRank: Rank
  opggLink?: string
  hoursPerDayMin?: number
  hoursPerDayMax?: number
  fullName?: string
  cpf?: string
  availableDays?: string[]
}

export interface UpdateProfessionalProfileParams {
  displayName: string
  bio: string
  lanes: string[]
  specialties: string[]
  peakTier: string
  opggLink: string
  availableDays: string[]
  hoursPerDayMin: number
  hoursPerDayMax: number
}

export interface TopBoosterEntry {
  user_id: string
  display_name: string
  avatar_url: string | null
  rating: number
  rating_count: number
  is_top3: boolean
  total_completed: number
  adjusted_win_rate: number | null
}

export interface BoosterPerformanceSegment {
  rank_bucket: string
  average_kda: number | null
  adjusted_win_rate: number | null
  total_matches: number
}
