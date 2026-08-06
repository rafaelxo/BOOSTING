import { Modal } from '@/components/ui'
import { OrderChat } from './OrderChat'
import type { OrderStatus, UserRole } from '@/types'

interface OrderChatModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  viewerRole: UserRole
  orderStatus?: OrderStatus
  orderShortId: string
}

// Chat deixou de ocupar permanentemente a lateral da página -- agora é um
// popup aberto pelo ícone na barra de ações do card do pedido. O cabeçalho
// "de fato" do chat (contagem de mensagens, bloquear/desbloquear pro admin)
// já vem de dentro do próprio OrderChat; o título do Modal só serve de
// âncora de contexto (qual pedido). max-h + overflow aqui é rede de
// segurança -- o próprio OrderChat já limita a lista de mensagens a 430px,
// isso só evita que o modal inteiro vaze da viewport em telas baixas.
export function OrderChatModal({ open, onOpenChange, orderId, viewerRole, orderStatus, orderShortId }: OrderChatModalProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Pedido #${orderShortId}`} maxWidth="lg">
      <div className="max-h-[80vh] overflow-y-auto -mx-2">
        <OrderChat orderId={orderId} viewerRole={viewerRole} orderStatus={orderStatus} />
      </div>
    </Modal>
  )
}
