import { rankStep } from '@/lib/pricing'
import { cn } from '@/lib/utils'
import type { Division, RankTier } from '@/types'
import { RankBadge } from '@/components/ui/RankBadge'

const MAX_STEP = 30 // Challenger — ver shared/pricing.ts::rankStep

export interface RankProgressionRailProps {
  currentTier: RankTier
  currentDivision: Division | null
  currentLp?: number | null
  targetTier?: RankTier | null
  targetDivision?: Division | null
  /** Corte ao vivo GM/Challenger (LP do último colocado), quando aplicável. */
  liveCutoffLp?: number | null
  size?: 'compact' | 'full'
  className?: string
}

// Componente-assinatura do produto: a "trilha de ascensão" -- usada no hero
// da home, no simulador de preço, no configurador de pedido, nos cards de
// pedido e no dashboard de pedido ativo. Nunca decorativa: a posição do
// preenchimento é sempre derivada do rank real (rankStep), nunca estética.
export function RankProgressionRail({
  currentTier, currentDivision, currentLp, targetTier, targetDivision, liveCutoffLp,
  size = 'full', className,
}: RankProgressionRailProps) {
  const currentPct = Math.min(100, (rankStep(currentTier, currentDivision) / MAX_STEP) * 100)
  const targetPct = targetTier != null
    ? Math.min(100, (rankStep(targetTier, targetDivision ?? null) / MAX_STEP) * 100)
    : null

  const railHeight = size === 'compact' ? 'h-1.5' : 'h-2.5'
  const badgeSize = size === 'compact' ? 'xs' : 'md'

  return (
    <div className={cn('w-full', className)}>
      <div className={cn('flex items-end', targetTier != null ? 'justify-between' : 'justify-start')}>
        <div className="flex flex-col items-center gap-1.5">
          <RankBadge tier={currentTier} division={currentDivision} size={badgeSize} />
          {currentLp != null && (
            <span className="text-xs font-semibold text-brand tabular-figures" data-tabular>
              {currentLp} LP
            </span>
          )}
        </div>
        {targetTier != null && (
          <div className="flex flex-col items-center gap-1.5">
            <RankBadge tier={targetTier} division={targetDivision ?? null} size={badgeSize} />
            <span className="text-xs font-semibold text-accent">Meta</span>
          </div>
        )}
      </div>

      <div
        className={cn(
          'relative mt-3 w-full rounded-full bg-bg-interactive overflow-hidden',
          railHeight,
        )}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(currentPct)}
        aria-label={`Progresso de ${currentTier} até ${targetTier ?? 'o topo do ranqueado'}`}
      >
        {/* Trilha de fundo -- gradiente sutil que percorre todos os tiers,
            sempre visível como referência do caminho inteiro. */}
        <div className="absolute inset-0 bg-gradient-rail opacity-20" />

        {/* Preenchimento até a posição atual -- verde (marca, progresso ao vivo). */}
        <div
          className="absolute inset-y-0 left-0 origin-left rounded-full bg-gradient-brand shadow-brand motion-safe:animate-rail-fill"
          style={{ width: `${currentPct}%` }}
        />

        {/* Marcador da meta -- dourado (acento, conquista). */}
        {targetPct != null && (
          <div
            className="absolute inset-y-0 w-0.5 bg-accent shadow-accent"
            style={{ left: `${targetPct}%` }}
          />
        )}
      </div>

      {liveCutoffLp != null && (
        <p className="mt-2 text-xs text-ink-muted">
          Corte ao vivo: <span className="font-semibold text-ink-secondary tabular-figures" data-tabular>{liveCutoffLp} LP</span>
        </p>
      )}
    </div>
  )
}
