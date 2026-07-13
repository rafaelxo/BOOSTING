import { Pencil, Trash2, Clock, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import type { BoosterService } from '@/types'

const UNIT_LABEL: Record<string, string> = {
  fixed: 'valor fechado',
  per_hour: 'por hora',
  per_division: 'por divisão',
  per_match: 'por partida',
}

export function BoosterServiceCard({
  service,
  onEdit,
  onDelete,
  onToggleActive,
  deleting,
  togglingActive,
}: {
  service: BoosterService
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
  deleting: boolean
  togglingActive: boolean
}) {
  const currency = useCurrency()

  return (
    <div className={cn('card p-5 flex flex-col gap-3 h-full', !service.is_active && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-ink text-sm leading-snug">{service.title}</h3>
          {service.service_type && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{service.service_type}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-bg-elevated transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg text-ink-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {service.description && (
        <p className="text-xs text-ink-secondary leading-relaxed flex-1">{service.description}</p>
      )}

      <div className="flex items-center gap-4 pt-1 border-t border-bg-elevated mt-auto">
        {service.tempo && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-ink-muted shrink-0" />
            <span className="text-xs text-ink-secondary">{service.tempo}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <DollarSign className="h-3.5 w-3.5 text-brand shrink-0" />
          <span className="text-sm font-bold text-brand">{currency(service.price)}</span>
          <span className="text-[10px] text-ink-muted">{UNIT_LABEL[service.unit] ?? service.unit}</span>
        </div>
      </div>

      <button
        onClick={onToggleActive}
        disabled={togglingActive}
        className={cn(
          'flex items-center justify-center gap-1.5 text-xs font-bold py-1.5 rounded-lg transition-colors disabled:opacity-40',
          service.is_active
            ? 'text-ink-secondary hover:bg-bg-elevated'
            : 'text-success bg-success/10 hover:bg-success/20',
        )}
      >
        {service.is_active ? 'Ativo — clique para desativar' : 'Inativo — clique para ativar'}
      </button>
    </div>
  )
}
