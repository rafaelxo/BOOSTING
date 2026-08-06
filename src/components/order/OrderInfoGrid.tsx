import type { LucideIcon } from 'lucide-react'

export interface OrderInfoGridItem {
  icon: LucideIcon
  label: string
  value: React.ReactNode
}

// Grid de informações do pedido (modo, fila, Riot ID, entrega, booster,
// valor...) -- centralizado e responsivo (1 coluna no mobile, 2 a partir de
// sm), reaproveitado pelas 3 páginas de detalhe (cliente/booster/admin) no
// lugar de cada uma montar seu próprio grid ad-hoc com espaçamento diferente.
export function OrderInfoGrid({ items }: { items: OrderInfoGridItem[] }) {
  if (!items.length) return null
  return (
    <div className="flex justify-center">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4 text-center max-w-2xl w-full">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label}>
            <p className="text-xs text-ink-muted flex items-center justify-center gap-1">
              <Icon className="h-3 w-3 shrink-0" />{label}
            </p>
            <div className="text-sm font-semibold text-ink mt-0.5" data-tabular>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
