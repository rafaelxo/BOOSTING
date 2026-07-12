import { Star } from 'lucide-react'

const REVIEWS = [
  { name: 'Alex M.', rank: 'Ouro → Platina', rating: 5, comment: 'Experiência muito tranquila. Cheguei à Platina em 2 dias e recebi atualizações durante todo o pedido.' },
  { name: 'TurboKai', rank: 'Prata → Diamante', rating: 5, comment: 'Fui do Prata ao Diamante em uma semana. Também usei coaching e mudou completamente minha forma de jogar.' },
  { name: 'Sarah V.', rank: 'Ferro → Ouro', rating: 5, comment: 'Eu estava com receio no começo, mas o serviço foi seguro, rápido e com ótima comunicação.' },
  { name: 'NightFury99', rank: 'Bronze → Platina', rating: 5, comment: 'Usei a transmissão ao vivo e acompanhei todas as partidas. O booster jogou muito bem.' },
  { name: 'CosmicPlayer', rank: 'Platina → Diamante', rating: 5, comment: 'Segunda vez usando o serviço. O atendimento continua rápido e o booster foi muito responsivo.' },
  { name: 'JaxMain', rank: 'Ouro → Esmeralda', rating: 4, comment: 'Demorou um pouco mais do que o previsto, mas o booster manteve boa comunicação. Fiquei satisfeito.' },
  { name: 'CryptoADC', rank: 'Prata → Ouro', rating: 5, comment: 'Pedi tarde da noite e de manhã o booster já tinha começado. A velocidade surpreendeu.' },
  { name: 'VoidWalker_', rank: 'Diamante → Mestre', rating: 5, comment: 'O serviço high elo é sério. Booster nível Desafiante, ótima taxa de vitória e execução impecável.' },
  { name: 'MidOrFeed22', rank: 'Bronze → Ouro', rating: 5, comment: 'Além de subir minha conta, aprendi bastante acompanhando as partidas pela transmissão.' },
]

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < rating ? 'fill-accent text-accent' : 'text-ink-muted'}`} />
      ))}
    </div>
  )
}

export function ReviewsPage() {
  const avg = (REVIEWS.reduce((sum, r) => sum + r.rating, 0) / REVIEWS.length).toFixed(1)

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
            <span className="text-ink-secondary">/ 5 com {REVIEWS.length} avaliações</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {REVIEWS.map(({ name, rank, rating, comment }) => (
            <div key={name} className="card p-5 space-y-4">
              <StarRating rating={rating} />
              <p className="text-sm text-ink-secondary leading-relaxed">"{comment}"</p>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">{name}</p>
                <span className="text-xs text-brand font-medium bg-brand/10 px-2 py-0.5 rounded-full">{rank}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
