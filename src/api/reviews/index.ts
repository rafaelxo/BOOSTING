import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { normalizeApiError } from '@/api/core/errors'
import { queryKeys } from '@/api/core/queryKeys'
import { listBoosterNames } from '@/api/boosters'

export interface PublicReview {
  id: string
  rating: number
  content: string
  created_at: string
  booster_id: string
  booster_display_name: string
}

// Avaliações reais e públicas (reviews.is_public = true) com o nome do
// booster anexado -- usado nas seções de "depoimentos" que antes mostravam
// TESTIMONIALS fabricados (src/features/public/data/testimonials.ts).
export async function listPublicReviews(limit = 24): Promise<PublicReview[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, content, created_at, booster_id')
    .eq('is_public', true)
    .not('content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw normalizeApiError(error)

  const rows = (data ?? []).filter(
    (r): r is typeof r & { content: string; booster_id: string } => !!r.content && !!r.booster_id,
  )
  const boosterIds = [...new Set(rows.map((r) => r.booster_id))]
  const names = await listBoosterNames(boosterIds)

  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    content: r.content,
    created_at: r.created_at,
    booster_id: r.booster_id,
    booster_display_name: names.get(r.booster_id)?.display_name ?? 'Booster EloPeak',
  }))
}

export function usePublicReviews(limit = 24) {
  return useQuery({
    queryKey: queryKeys.reviews.public(limit),
    queryFn: () => listPublicReviews(limit),
    staleTime: 60_000,
  })
}

export interface BoosterReview {
  id: string
  rating: number
  content: string | null
  created_at: string
}

export async function listBoosterReviews(boosterUserId: string, limit = 50): Promise<BoosterReview[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, content, created_at')
    .eq('booster_id', boosterUserId)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw normalizeApiError(error)
  return data ?? []
}

export function useBoosterReviews(boosterUserId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reviews.forBooster(boosterUserId ?? ''),
    queryFn: () => listBoosterReviews(boosterUserId!),
    enabled: !!boosterUserId,
  })
}
