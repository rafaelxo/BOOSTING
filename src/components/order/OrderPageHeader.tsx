import { Link } from 'react-router-dom'
import { ArrowLeft, MessageCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

interface OrderPageHeaderProps {
  backHref: string
  orderIdShort: string
  statusBadge: React.ReactNode
  /** Badges/infos extras abaixo do título (ex.: "pedido reatribuído", countdown). */
  extra?: React.ReactNode
  onDrop?: () => void
  dropDisabled?: boolean
  dropTooltip?: string
  onChat: () => void
  chatUnavailable?: boolean
  primary?: React.ReactNode
}

/**
 * Header de página normal do dashboard (voltar + título+status à esquerda,
 * ações à direita) -- substitui o antigo card "barra de ações" que existia
 * dentro do card único do pedido. Reaproveitado por cliente/booster/admin.
 */
export function OrderPageHeader({
  backHref, orderIdShort, statusBadge, extra, onDrop, dropDisabled, dropTooltip, onChat, chatUnavailable, primary,
}: OrderPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar" className="shrink-0">
          <Link to={backHref}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-ink truncate">Pedido #{orderIdShort}</h1>
            {statusBadge}
          </div>
          {extra && <div className="flex items-center gap-2 flex-wrap mt-1.5">{extra}</div>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onDrop && (
          <Button
            variant="danger-ghost"
            size="sm"
            leftIcon={<AlertTriangle className="h-4 w-4" />}
            onClick={onDrop}
            disabled={dropDisabled}
            title={dropDisabled ? dropTooltip : undefined}
          >
            Dropar
          </Button>
        )}
        <Button
          variant="secondary"
          size="icon"
          aria-label="Chat do pedido"
          onClick={onChat}
          disabled={chatUnavailable}
          title={chatUnavailable ? 'Chat disponível após um booster ser associado' : 'Abrir chat'}
          className={cn(chatUnavailable && 'opacity-50')}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
        {primary}
      </div>
    </div>
  )
}
