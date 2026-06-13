import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Shield, CheckCircle2, XCircle } from 'lucide-react'
import { Button, BoosterStatusBadge, EmptyState, Skeleton } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatDate } from '@/lib/utils'
import type { BoosterProfile } from '@/types'
import { useState } from 'react'

export function AdminBoostersPage() {
  const { profile } = useAuthStore()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<string>('all')

  const { data: boosters, isLoading } = useQuery({
    queryKey: ['admin-boosters'],
    queryFn: async () => {
      const { data, error } = await supabase.from('booster_profiles').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as BoosterProfile[]
    },
  })

  const updateBoosterStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('booster_profiles')
        .update({ status, verified_at: status === 'approved' ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
      await supabase.from('audit_logs').insert({
        actor_id: profile?.id, actor_role: profile?.role,
        action: `booster.${status}`, entity_type: 'booster_profile', entity_id: id,
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-boosters'] }),
  })

  const filtered = boosters?.filter(b => filter === 'all' || b.status === filter) ?? []

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-ink">Boosters</h1>

      <div className="flex gap-1 bg-bg-surface border border-bg-elevated rounded-xl p-1 w-fit">
        {['all', 'pending', 'under_review', 'approved', 'suspended'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${filter === s ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'}`}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="card p-0">
        {isLoading ? <div className="p-4"><Skeleton className="h-48 w-full" /></div> :
          !filtered.length ? <EmptyState icon={Shield} title="No boosters found" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Games</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link to={`/admin/boosters/${b.id}`} className="text-brand hover:underline font-medium text-sm">
                      {b.display_name}
                    </Link>
                  </TableCell>
                  <TableCell>{b.games.join(', ')}</TableCell>
                  <TableCell>{b.rating.toFixed(1)} ⭐</TableCell>
                  <TableCell>{b.total_completed}</TableCell>
                  <TableCell><BoosterStatusBadge status={b.status} /></TableCell>
                  <TableCell>{formatDate(b.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {b.status === 'pending' || b.status === 'under_review' ? (
                        <>
                          <Button size="xs" variant="success" leftIcon={<CheckCircle2 className="h-3 w-3" />}
                            onClick={() => updateBoosterStatus.mutate({ id: b.id, status: 'approved' })}>
                            Approve
                          </Button>
                          <Button size="xs" variant="danger" leftIcon={<XCircle className="h-3 w-3" />}
                            onClick={() => updateBoosterStatus.mutate({ id: b.id, status: 'rejected' })}>
                            Reject
                          </Button>
                        </>
                      ) : b.status === 'approved' ? (
                        <Button size="xs" variant="danger-ghost"
                          onClick={() => updateBoosterStatus.mutate({ id: b.id, status: 'suspended' })}>
                          Suspend
                        </Button>
                      ) : b.status === 'suspended' ? (
                        <Button size="xs" variant="secondary"
                          onClick={() => updateBoosterStatus.mutate({ id: b.id, status: 'approved' })}>
                          Reinstate
                        </Button>
                      ) : null}
                    </div>
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
