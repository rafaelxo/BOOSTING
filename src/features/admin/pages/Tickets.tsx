import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { HeadphonesIcon } from 'lucide-react'
import { EmptyState, Skeleton, TicketStatusBadge, TicketPriorityBadge } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { timeAgo } from '@/lib/utils'
import type { SupportTicket } from '@/types'

export function AdminTicketsPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['admin-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as SupportTicket[]
    },
    refetchInterval: 15000,
  })

  const assignTicket = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase
        .from('support_tickets')
        .update({ assigned_to: profile?.id, status: 'in_progress' })
        .eq('id', ticketId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-tickets'] }),
  })

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-ink">Support Tickets</h1>
      <div className="card p-0">
        {isLoading ? <div className="p-4"><Skeleton className="h-48 w-full" /></div> :
          !tickets?.length ? <EmptyState icon={HeadphonesIcon} title="No tickets" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link to={`/admin/tickets/${t.id}`} className="text-brand hover:underline text-sm font-medium">
                      {t.subject}
                    </Link>
                  </TableCell>
                  <TableCell><TicketPriorityBadge priority={t.priority} /></TableCell>
                  <TableCell><TicketStatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-xs">{t.assigned_to ? t.assigned_to.slice(0, 8) + '...' : <span className="text-ink-muted">Unassigned</span>}</TableCell>
                  <TableCell>{timeAgo(t.created_at)}</TableCell>
                  <TableCell>
                    {!t.assigned_to && (
                      <button
                        onClick={() => assignTicket.mutate(t.id)}
                        className="text-xs text-brand hover:underline"
                      >
                        Assign to me
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
