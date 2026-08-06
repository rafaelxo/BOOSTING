import { Link } from 'react-router-dom'
import { ArrowLeft, MessageCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

interface OrderActionBarProps {
  backHref: string
  onDrop?: () => void
  dropDisabled?: boolean
  dropTooltip?: string
  onChat: () => void
  chatUnavailable?: boolean
  primary?: React.ReactNode
}

/**
 * Barra superior única do card de pedido: voltar + dropar à esquerda, chat +
 * ação principal (iniciar/concluir/confirmar) à direita. Substitui o antigo
 * cabeçalho de página espalhado + card de drop separado -- tudo fica dentro
 * do mesmo card, reaproveitado por cliente/booster/admin.
 */
export function OrderActionBar({ backHref, onDrop, dropDisabled, dropTooltip, onChat, chatUnavailable, primary }: OrderActionBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar">
          <Link to={backHref}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
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
      </div>
      <div className="flex items-center gap-2">
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
