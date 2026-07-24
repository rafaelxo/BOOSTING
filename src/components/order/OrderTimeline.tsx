import { Clock } from 'lucide-react'
import { Card } from '@/components/ui'
import { ORDER_STATUS_LABEL, timeAgo } from '@/lib/utils'
import type { OrderStatusHistory } from '@/types'

// Compartilhada entre cliente/booster/admin -- antes cada tela tinha seu
// próprio visual pro mesmo dado (o admin usava uma lista simples de pontos
// soltos, sem a linha conectando as etapas).
export function OrderTimeline({ history }: { history: OrderStatusHistory[] | undefined }) {
  return (
    <Card padding="md">
      <h3 className="text-sm font-semibold text-ink mb-4">Histórico do Pedido</h3>
      {!history?.length ? (
        <p className="text-xs text-ink-muted">Sem histórico ainda.</p>
      ) : (
        <div className="relative">
          <div className="absolute left-3.5 top-4 bottom-4 w-px bg-border-subtle" />
          <div className="space-y-4">
            {history.map((entry, idx) => (
              <div key={entry.id} className="flex items-start gap-4 relative">
                <div className={`h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 z-10 ${
                  idx === history.length - 1 ? 'border-brand bg-brand' : 'border-border-subtle bg-bg-surface'
                }`}>
                  <Clock className="h-3 w-3 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink">
                    {ORDER_STATUS_LABEL[entry.to_status] ?? entry.to_status.replace(/_/g, ' ')}
                  </p>
                  <p className="text-[10px] text-ink-muted mt-0.5">{timeAgo(entry.created_at)}</p>
                  {entry.reason && <p className="text-xs text-ink-secondary mt-0.5">{entry.reason}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
