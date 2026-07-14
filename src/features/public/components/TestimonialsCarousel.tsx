import { TESTIMONIALS } from '../data/testimonials'
import { TestimonialCard } from './TestimonialCard'

// Duas fileiras, sentidos opostos — cada uma pega metade dos depoimentos
// (índices pares/ímpares, pra misturar boost e coaching nas duas), duplicada
// pra fechar o loop sem emenda. Velocidades diferentes evitam o efeito de
// "esteira única" e dão mais vida à seção sem virar bagunça.
const ROW_A = TESTIMONIALS.filter((_, i) => i % 2 === 0)
const ROW_B = TESTIMONIALS.filter((_, i) => i % 2 === 1)

function MarqueeRow({ items, animationClass }: { items: typeof TESTIMONIALS; animationClass: string }) {
  const track = [...items, ...items]
  return (
    <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
      <div className={`flex w-max gap-5 motion-reduce:animate-none group-hover:[animation-play-state:paused] ${animationClass}`}>
        {track.map((testimonial, i) => (
          <TestimonialCard key={`${testimonial.name}-${i}`} {...testimonial} className="w-80 shrink-0" />
        ))}
      </div>
    </div>
  )
}

export function TestimonialsCarousel() {
  return (
    <div className="space-y-5">
      <MarqueeRow items={ROW_A} animationClass="animate-marquee" />
      <MarqueeRow items={ROW_B} animationClass="animate-marquee-reverse" />
    </div>
  )
}
