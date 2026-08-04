import { useState } from 'react'
import { Star, MessageSquareText } from 'lucide-react'
import { Button, Card, ErrorAlert, Modal, Skeleton, StarRating } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useOwnReview, useCreateReview } from '@/api/reviews'
import type { Order } from '@/types'

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5"
          aria-label={`${i} estrela${i === 1 ? '' : 's'}`}
        >
          <Star className={cn('h-7 w-7 transition-colors', (hover || value) >= i ? 'text-warning fill-warning' : 'text-bg-overlay')} />
        </button>
      ))}
    </div>
  )
}

// Só existe pra pedidos 'completed' -- a policy reviews_customer_insert
// (migration archive 137) exige isso no banco também, então tentar antes
// sempre falharia. Uma review por pedido (order_id é unique em reviews).
export function OrderReviewSection({ order }: { order: Order }) {
  const isCompleted = order.status === 'completed'
  const { data: review, isLoading } = useOwnReview(isCompleted ? order.id : undefined)
  const createReview = useCreateReview(order.id)
  const [showModal, setShowModal] = useState(false)
  const [rating, setRating] = useState(0)
  const [content, setContent] = useState('')

  if (!isCompleted) return null

  if (isLoading) {
    return (
      <Card padding="md">
        <Skeleton className="h-12 w-full" />
      </Card>
    )
  }

  function closeModal() {
    setShowModal(false)
    setRating(0)
    setContent('')
  }

  if (review) {
    return (
      <Card padding="md">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquareText className="h-4 w-4 text-brand shrink-0" />
          <h3 className="text-sm font-semibold text-ink">Sua avaliação</h3>
        </div>
        <StarRating rating={review.rating} showValue={false} size="md" />
        {review.content && <p className="text-sm text-ink-secondary mt-2">{review.content}</p>}
      </Card>
    )
  }

  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquareText className="h-4 w-4 text-brand shrink-0" />
        <h3 className="text-sm font-semibold text-ink">Avalie seu booster</h3>
      </div>
      <p className="text-xs text-ink-secondary mb-3">Conte como foi sua experiência com o serviço.</p>

      <Button className="w-full" variant="success" leftIcon={<Star className="h-4 w-4" />} onClick={() => setShowModal(true)}>
        Avaliar
      </Button>

      <Modal
        open={showModal}
        onOpenChange={(open) => { if (!open) closeModal() }}
        title="Avalie seu booster"
        description="Conte como foi sua experiência com o serviço."
      >
        <div className="flex justify-center py-1">
          <StarPicker value={rating} onChange={setRating} />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Deixe um comentário (opcional)..."
          className="input-base w-full min-h-[100px] resize-none text-sm"
        />
        {createReview.isError && (
          <ErrorAlert
            className="mt-2"
            message={createReview.error instanceof Error ? createReview.error.message : 'Erro ao enviar avaliação'}
          />
        )}
        <div className="flex gap-3 justify-end pt-2">
          <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
          <Button
            variant="success"
            loading={createReview.isPending}
            disabled={rating === 0}
            onClick={() => createReview.mutate(
              { boosterId: order.assigned_booster_id, rating, content },
              { onSuccess: closeModal },
            )}
          >
            Enviar avaliação
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
