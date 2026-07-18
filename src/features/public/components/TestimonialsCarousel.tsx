import { MessageSquareText } from 'lucide-react'
import { EmptyState, Skeleton } from '@/components/ui'
import { usePublicReviews } from '@/api/reviews'
import { TestimonialCard } from './TestimonialCard'

// Avaliações reais e públicas (reviews.is_public = true) -- nunca depoimentos
// inventados. Se ainda não houver avaliações suficientes, mostra um estado
// vazio explícito em vez de inventar conteúdo (ver master-prompt seção 28.1).
export function TestimonialsCarousel() {
  const { data: reviews, isLoading } = usePublicReviews()

  if (isLoading) {
    return (
      <div className="max-w-screen-xl mx-auto px-5 sm:px-8 flex gap-5 overflow-hidden">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 w-80 shrink-0 rounded-2xl" />)}
      </div>
    )
  }

  if (!reviews?.length) {
    return (
      <div className="max-w-screen-xl mx-auto px-5 sm:px-8">
        <EmptyState
          icon={MessageSquareText}
          title="Ainda sem avaliações públicas"
          description="As primeiras avaliações de clientes aparecerão aqui assim que forem publicadas."
        />
      </div>
    )
  }

  // Duplica a lista só pra fechar o loop visual da esteira sem emenda —
  // os dados em si nunca são fabricados, sempre vêm de reviews reais.
  const track = reviews.length >= 4 ? [...reviews, ...reviews] : reviews

  return (
    <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
      <div className="flex w-max gap-5 animate-marquee group-hover:[animation-play-state:paused]">
        {track.map((review, i) => (
          <TestimonialCard key={`${review.id}-${i}`} {...review} className="w-80 shrink-0" />
        ))}
      </div>
    </div>
  )
}
