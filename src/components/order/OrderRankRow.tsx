import { ChevronRight } from 'lucide-react'
import { RankBadge } from '@/components/ui/RankBadge'
import { formatRank } from '@/lib/utils'
import type { Division, RankTier } from '@/types'

export interface OrderRankRowProps {
  currentTier: RankTier
  currentDivision: Division | null
  targetTier?: RankTier | null
  targetDivision?: Division | null
  /** Coluna central entre os dois badges (pontos atuais, status "Aguardando
   * início"/"Sincronizando…" etc.) -- cada consumidor decide o conteúdo, o
   * layout (linha + seta) é sempre o mesmo. */
  centerContent?: React.ReactNode
  /** MD5 usa "rank da última temporada" em vez de "Rank Atual" -- mesmo
   * badge, rótulo diferente (a conta está em colocação, sem rank atual de
   * verdade nesta fila). */
  currentLabel?: string
}

// Linha "rank atual ↔ pontos ↔ rank alvo" -- markup puro, sem buscar dado
// nenhum. Extraído de OrderRankSummary (pedido já existe, busca
// verificação/estimativa real) pra ser reaproveitado também pelo resumo do
// order-builder (StepReview, pedido ainda nem existe -- só o que o cliente
// configurou). Os dois PRECISAM ficar visualmente idênticos: o cliente vê o
// resumo antes de pagar e depois na página do pedido em andamento, então
// qualquer diferença de layout ali soa como "mudou o pedido".
export function OrderRankRow({ currentTier, currentDivision, targetTier, targetDivision, centerContent, currentLabel = 'Rank Atual' }: OrderRankRowProps) {
  const hasTarget = !!targetTier

  return (
    <div className="mb-2 flex justify-center">
      <div className="flex items-center gap-6 sm:gap-10">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <RankBadge tier={currentTier} division={currentDivision} size="lg" showLabel={false} />
          <div className="min-w-0">
            <p className="text-[11px] text-ink-muted uppercase tracking-wide">{currentLabel}</p>
            <p className="text-base font-bold text-ink truncate">{formatRank(currentTier, currentDivision)}</p>
          </div>
        </div>

        {hasTarget && (
          <>
            {/* Coluna central: conteúdo do consumidor empilhado sobre a
                seta -- largura fixa (não flex-1) pra não espalhar os ranks
                até as bordas de um card largo; eles ficam ancorados perto
                do meio da seção, separados só por essa coluna. */}
            <div className="w-24 sm:w-28 shrink-0 flex flex-col items-center gap-1.5">
              {centerContent}
              <div className="w-full flex items-center gap-1.5 text-border-subtle">
                <span className="h-px flex-1 bg-border-subtle" />
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
              </div>
            </div>

            <div className="flex items-center gap-2.5 min-w-0 shrink-0">
              <RankBadge tier={targetTier!} division={targetDivision ?? null} size="lg" showLabel={false} />
              <div className="min-w-0">
                <p className="text-[11px] text-ink-muted uppercase tracking-wide">Rank Alvo</p>
                <p className="text-base font-bold text-ink truncate">{formatRank(targetTier!, targetDivision ?? null)}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
