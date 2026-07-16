import { useEffect, useState } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CountdownTimerProps {
  /** Início real do boost (orders.match_sync_started_at) — nunca created_at,
   * que só marca o checkout. Sem isso ainda não há prazo a contar. */
  startedAt: string | null
  /** orders.estimated_hours — já vem multiplicado por 2 no backend
   * (DELIVERY_ESTIMATE_MULTIPLIER em shared/pricing.ts). */
  estimatedHours: number | null
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function CountdownTimer({ startedAt, estimatedHours }: CountdownTimerProps) {
  const now = useNow(30_000)
  if (!startedAt || estimatedHours == null) return null

  const deadline = new Date(startedAt).getTime() + estimatedHours * 60 * 60 * 1000
  const remainingMs = deadline - now
  const expired = remainingMs <= 0

  const absMs = Math.abs(remainingMs)
  const days = Math.floor(absMs / (24 * 60 * 60 * 1000))
  const hours = Math.floor((absMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  const minutes = Math.floor((absMs % (60 * 60 * 1000)) / (60 * 1000))

  return (
    <div className={cn(
      'flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold',
      expired ? 'bg-danger/10 text-danger' : 'bg-bg-elevated text-ink-secondary',
    )}>
      {expired ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Clock className="h-3.5 w-3.5 shrink-0" />}
      {expired ? (
        <span>Prazo excedido — em atendimento prioritário</span>
      ) : (
        <span>
          {days > 0 && `${days}d `}{hours}h {minutes}min restantes
        </span>
      )}
    </div>
  )
}
