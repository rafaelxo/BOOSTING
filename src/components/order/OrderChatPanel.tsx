import * as Dialog from '@radix-ui/react-dialog'
import { OrderChat } from './OrderChat'
import type { OrderStatus, UserRole } from '@/types'

interface OrderChatPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  viewerRole: UserRole
  orderStatus?: OrderStatus
}

// Painel lateral (não mais modal central) -- entra pela direita com a mesma
// primitiva Radix Dialog já usada no Modal genérico, só que posicionado como
// sheet: fixed right-0 h-full, com as classes de animação do
// tailwindcss-animate (já instalado, só não usado em nenhum outro lugar
// ainda) fazendo o slide-in/out em vez de aparecer instantâneo no centro.
export function OrderChatPanel({ open, onOpenChange, orderId, viewerRole, orderStatus }: OrderChatPanelProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-full flex-col border-l border-bg-elevated bg-bg-surface shadow-2xl focus:outline-none sm:w-[420px] md:w-[38vw] md:min-w-[380px] md:max-w-[500px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-300"
        >
          <Dialog.Title className="sr-only">Chat do pedido</Dialog.Title>
          <Dialog.Description className="sr-only">Conversa entre cliente, booster e administração sobre este pedido.</Dialog.Description>
          <OrderChat orderId={orderId} viewerRole={viewerRole} orderStatus={orderStatus} onClose={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
