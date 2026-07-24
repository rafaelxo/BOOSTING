import { Link } from 'react-router-dom'
import { Shield, CheckCircle2, XCircle, Trophy, Star } from 'lucide-react'
import { Button, BoosterStatusBadge, EmptyState, Skeleton, ErrorAlert } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { formatDate } from '@/lib/utils'
import type { BoosterProfile } from '@/types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAdminBoosters, useAdminApproveBooster } from '@/api/boosters'

export function AdminBoostersPage() {
  const [filter, setFilter] = useState<BoosterProfile['status'] | 'all'>('all')
  const { t } = useTranslation()

  const filterLabels: Record<string, string> = {
    all: t('admin.boosters.filters.all'),
    pending: t('admin.boosters.filters.pending'),
    under_review: t('admin.boosters.filters.under_review'),
    approved: t('admin.boosters.filters.approved'),
    suspended: t('admin.boosters.filters.suspended'),
  }

  const { data: boosters, isLoading } = useAdminBoosters(filter)
  const updateBoosterStatusMutation = useAdminApproveBooster()
  const updateBoosterStatus = {
    mutate: (params: { id: string; status: 'approved' | 'rejected' | 'suspended' }) =>
      updateBoosterStatusMutation.mutate({ boosterId: params.id, newStatus: params.status }),
  }

  const filtered = boosters ?? []

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-ink">{t('admin.boosters.title')}</h1>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 bg-bg-surface border border-bg-elevated rounded-xl p-1 w-fit">
          {(['all', 'pending', 'under_review', 'approved', 'suspended'] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${filter === s ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink'}`}>
              {filterLabels[s] ?? s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length >= 100 && (
        <p className="text-xs text-warning">Mostrando os 100 boosters mais recentes deste filtro — pode haver mais.</p>
      )}

      {updateBoosterStatusMutation.isError && (
        <ErrorAlert message={(updateBoosterStatusMutation.error as Error).message} />
      )}

      <div className="card p-0">
        {isLoading ? <div className="p-4"><Skeleton className="h-48 w-full" /></div> :
          !filtered.length ? <EmptyState icon={Shield} title={t('admin.boosters.empty')} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.boosters.table.name')}</TableHead>
                <TableHead>{t('admin.boosters.table.games')}</TableHead>
                <TableHead>{t('admin.boosters.table.rating')}</TableHead>
                <TableHead>{t('admin.boosters.table.completed')}</TableHead>
                <TableHead>{t('admin.boosters.table.status')}</TableHead>
                <TableHead>{t('admin.boosters.table.joined')}</TableHead>
                <TableHead>{t('admin.boosters.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link to={`/admin/boosters/${b.id}`} className="text-brand hover:underline font-medium text-sm">
                        {b.display_name}
                      </Link>
                      {b.is_top3 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold bg-warning/10 text-warning border border-warning/20 rounded-lg px-1.5 py-0.5 uppercase tracking-wide">
                          <Trophy className="h-2.5 w-2.5" /> TOP3
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{b.games?.join(', ') || '—'}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      {b.rating.toFixed(1)}
                      <Star className="h-3 w-3 text-warning fill-warning" />
                    </span>
                  </TableCell>
                  <TableCell>{b.total_completed}</TableCell>
                  <TableCell><BoosterStatusBadge status={b.status} /></TableCell>
                  <TableCell>{formatDate(b.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {b.status === 'pending' || b.status === 'under_review' ? (
                        <>
                          <Button size="xs" variant="success" leftIcon={<CheckCircle2 className="h-3 w-3" />}
                            loading={updateBoosterStatusMutation.isPending}
                            onClick={() => updateBoosterStatus.mutate({ id: b.id, status: 'approved' })}>
                            {t('admin.boosters.approve')}
                          </Button>
                          <Button size="xs" variant="danger" leftIcon={<XCircle className="h-3 w-3" />}
                            loading={updateBoosterStatusMutation.isPending}
                            onClick={() => updateBoosterStatus.mutate({ id: b.id, status: 'rejected' })}>
                            {t('admin.boosters.reject')}
                          </Button>
                        </>
                      ) : b.status === 'approved' ? (
                        <Button size="xs" variant="danger-ghost"
                          loading={updateBoosterStatusMutation.isPending}
                          onClick={() => updateBoosterStatus.mutate({ id: b.id, status: 'suspended' })}>
                          {t('admin.boosters.suspend')}
                        </Button>
                      ) : b.status === 'suspended' ? (
                        <Button size="xs" variant="secondary"
                          loading={updateBoosterStatusMutation.isPending}
                          onClick={() => updateBoosterStatus.mutate({ id: b.id, status: 'approved' })}>
                          {t('admin.boosters.reinstate')}
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
