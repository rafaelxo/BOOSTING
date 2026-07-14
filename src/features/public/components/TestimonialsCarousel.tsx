import { TESTIMONIALS } from '../data/testimonials'
import { TestimonialCard } from './TestimonialCard'

// TESTIMONIALS já vem com boost e coaching intercalados (ver testimonials.ts)
// — duplicado aqui só pra fechar o loop da esteira sem emenda.
const TRACK = [...TESTIMONIALS, ...TESTIMONIALS]

export function TestimonialsCarousel() {
  return (
    <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
      <div className="flex w-max gap-5 animate-marquee group-hover:[animation-play-state:paused]">
        {TRACK.map((testimonial, i) => (
          <TestimonialCard key={`${testimonial.name}-${i}`} {...testimonial} className="w-80 shrink-0" />
        ))}
      </div>
    </div>
  )
}
