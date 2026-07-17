import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/core/queryKeys'
import { useRealtimeInvalidate } from '@/api/core/realtime'
import { getOrderChat } from './queries'
import { sendOrderMessage, setOrderChatLock } from './mutations'

export function useOrderChat(orderId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.orders.chat(orderId ?? ''),
    queryFn: () => getOrderChat(orderId!),
    enabled: !!orderId,
    refetchInterval: 15_000,
  })

  useRealtimeInvalidate({
    channel: `order-chat-${orderId ?? 'none'}`,
    table: 'order_messages',
    filter: orderId ? `order_id=eq.${orderId}` : undefined,
    queryKeys: orderId ? [queryKeys.orders.chat(orderId)] : [],
    enabled: !!orderId,
  })

  return query
}

export function useSendOrderMessage(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => sendOrderMessage({ orderId, content }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.orders.chat(orderId) }),
  })
}

export function useSetOrderChatLock(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (locked: boolean) => setOrderChatLock({ orderId, locked }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.orders.chat(orderId) }),
  })
}
