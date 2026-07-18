import { ShieldCheck, Quote } from 'lucide-react'
import { StarRating } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { PublicReview } from '@/api/reviews'

export function TestimonialCard({ rating, content, booster_display_name, className }: PublicReview & { className?: string }) {
  return (
    <div className={cn('card relative p-5 flex flex-col gap-4 overflow-hidden', className)}>
      <Quote className="absolute -top-2 -right-1 h-16 w-16 text-ink/[0.04] rotate-180" strokeWidth={1} />
      <div className="flex items-center gap-2 relative">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success shrink-0">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">Cliente verificado</p>
          <StarRating rating={rating} showValue={false} size="xs" />
        </div>
      </div>
      <p className="text-sm text-ink-secondary leading-relaxed relative">&ldquo;{content}&rdquo;</p>
      <span className="inline-flex items-center gap-1.5 self-start text-xs font-medium px-2.5 py-1 rounded-full relative border border-brand/40 text-brand bg-brand/5">
        Booster: {booster_display_name}
      </span>
    </div>
  )
}
