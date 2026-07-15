import { TrendingUp, Users, Quote } from 'lucide-react'
import { Avatar, StarRating } from '@/components/ui'
import { cn } from '@/lib/utils'
import { riotProfileIconUrl } from '@/lib/riotAssets'
import type { Testimonial } from '../data/testimonials'

export function TestimonialCard({ name, service, tag, rating, comment, iconId, className }: Testimonial & { className?: string }) {
  const isCoaching = service === 'coaching'
  return (
    <div className={cn('card relative p-5 flex flex-col gap-4 overflow-hidden', className)}>
      <Quote className="absolute -top-2 -right-1 h-16 w-16 text-ink/[0.04] rotate-180" strokeWidth={1} />
      <div className="flex items-center gap-3 relative">
        <Avatar src={riotProfileIconUrl(iconId)} name={name} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{name}</p>
          <StarRating rating={rating} showValue={false} size="xs" />
        </div>
      </div>
      <p className="text-sm text-ink-secondary leading-relaxed relative">"{comment}"</p>
      <span className="inline-flex items-center gap-1.5 self-start text-xs font-medium px-2.5 py-1 rounded-full relative border border-brand/40 text-brand bg-brand/5">
        {isCoaching ? <Users className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
        {tag}
      </span>
    </div>
  )
}
