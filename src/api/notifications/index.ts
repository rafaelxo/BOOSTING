import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { normalizeApiError } from '@/api/core/errors'
import { queryKeys } from '@/api/core/queryKeys'
import { useRealtimeInvalidate } from '@/api/core/realtime'
import type { Notification } from '@/types'

export type { Notification }

export async function listNotifications(userId: string, limit = 5): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw normalizeApiError(error)
  return (data ?? []) as unknown as Notification[]
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).in('id', ids)
  if (error) throw normalizeApiError(error)
}

export function useNotifications(userId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.notifications.list(userId ?? ''),
    queryFn: () => listNotifications(userId!),
    enabled: !!userId,
    refetchInterval: 30_000,
  })

  useRealtimeInvalidate({
    channel: `notifications-${userId ?? 'none'}`,
    table: 'notifications',
    event: 'INSERT',
    filter: userId ? `user_id=eq.${userId}` : undefined,
    queryKeys: userId ? [queryKeys.notifications.list(userId)] : [],
    enabled: !!userId,
  })

  return query
}

export function useMarkNotificationsRead(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(userId ?? '') }),
  })
}
