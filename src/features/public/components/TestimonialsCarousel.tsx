import { StarRating } from '@/components/ui'
import { TESTIMONIALS } from '../data/testimonials'

const TRACK = [...TESTIMONIALS, ...TESTIMONIALS]

export function TestimonialsCarousel() {
  return (
    <div
      className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]"
    >
      <div className="flex w-max gap-5 animate-marquee group-hover:[animation-play-state:paused]">
        {TRACK.map(({ name, rank, rating, comment }, i) => (
          <div key={`${name}-${i}`} className="card p-5 space-y-4 w-80 shrink-0">
            <StarRating rating={rating} showValue={false} />
            <p className="text-sm text-ink-secondary leading-relaxed">"{comment}"</p>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{name}</p>
              <span className="text-xs text-brand font-medium bg-brand/10 px-2 py-0.5 rounded-full">{rank}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
