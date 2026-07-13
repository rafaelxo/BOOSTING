import { useQuery } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import { Card, EmptyState, Skeleton, StarRating } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import type { Review } from '@/types'

/**
 * Lista as avaliações públicas recebidas pelo booster. Sem edição/exclusão
 * pelo próprio booster — não existe policy para isso (moderação é só admin,
 * via moderate_review).
 */
export function BoosterReviews({ userId }: { userId: string }) {
  const { data: reviews, isLoading } = useQuery({
    queryKey: ['booster-reviews', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('booster_id', userId)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Review[]
    },
    enabled: !!userId,
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-sm font-bold text-ink mb-3">Avaliações</h2>
      {!reviews?.length ? (
        <EmptyState icon={MessageSquare} title="Você ainda não recebeu avaliações." />
      ) : (
        <div className="space-y-3">
          <StarRating
            rating={reviews.reduce((s, r) => s + r.rating, 0) / reviews.length}
            count={reviews.length}
          />
          {reviews.map(review => (
            <Card key={review.id} padding="md">
              <div className="flex items-center justify-between mb-2">
                <StarRating rating={review.rating} size="xs" showValue={false} />
                <span className="text-xs text-ink-muted">{formatDate(review.created_at)}</span>
              </div>
              {review.content && <p className="text-sm text-ink-secondary leading-relaxed">{review.content}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
