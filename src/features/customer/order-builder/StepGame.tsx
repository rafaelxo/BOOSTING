import { useOrderBuilderStore } from '@/stores/orderBuilderStore'
import { cn } from '@/lib/utils'
import type { GameSlug } from '@/types'
import { CheckCircle2 } from 'lucide-react'

const GAMES: { slug: GameSlug; name: string; emoji: string; available: boolean; note?: string }[] = [
  { slug: 'lol', name: 'League of Legends', emoji: '⚔️', available: true },
  { slug: 'valorant', name: 'Valorant', emoji: '🔫', available: false, note: 'Em breve' },
  { slug: 'tft', name: 'Teamfight Tactics', emoji: '♟️', available: false, note: 'Em breve' },
]

export function StepGame() {
  const { gameSlug, setGame } = useOrderBuilderStore()

  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">Selecionar Jogo</h2>
      <p className="text-sm text-ink-secondary mb-6">
        Escolha o jogo que você quer contratar.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {GAMES.map(({ slug, name, emoji, available, note }) => (
          <button
            key={slug}
            onClick={() => available && setGame(slug, slug)}
            disabled={!available}
            className={cn(
              'relative flex flex-col items-center gap-3 p-6 rounded-2xl border-2 text-left transition-all duration-150',
              gameSlug === slug
                ? 'border-brand bg-brand-muted shadow-brand'
                : available
                  ? 'border-bg-elevated bg-bg-card hover:border-brand/40 hover:bg-bg-elevated cursor-pointer'
                  : 'border-bg-elevated bg-bg-card opacity-50 cursor-not-allowed'
            )}
          >
            {gameSlug === slug && (
              <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-brand" />
            )}
            <span className="text-4xl">{emoji}</span>
            <div className="text-center">
              <p className={cn('text-sm font-semibold', gameSlug === slug ? 'text-brand' : 'text-ink')}>{name}</p>
              {note && <p className="text-xs text-ink-muted mt-0.5">{note}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
