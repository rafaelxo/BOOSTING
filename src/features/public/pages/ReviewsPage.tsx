import { Star } from 'lucide-react'
import { TESTIMONIALS } from '../data/testimonials'
import { TestimonialCard } from '../components/TestimonialCard'

export function ReviewsPage() {
  const avg = (TESTIMONIALS.reduce((sum, r) => sum + r.rating, 0) / TESTIMONIALS.length).toFixed(1)

  return (
    <div className="py-16">
      <div className="container-app max-w-5xl space-y-12">
        <div className="text-center">
          <p className="section-label mb-3">Clientes verificados</p>
          <h1 className="text-4xl font-extrabold text-ink mb-2">Avaliações de clientes</h1>
          <div className="flex items-center justify-center gap-3 mt-4">
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-accent text-accent" />
              ))}
            </div>
            <span className="text-2xl font-bold text-ink">{avg}</span>
            <span className="text-ink-secondary">/ 5 com {TESTIMONIALS.length} avaliações</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {TESTIMONIALS.map((testimonial) => (
            <TestimonialCard key={testimonial.name} {...testimonial} />
          ))}
        </div>
      </div>
    </div>
  )
}
