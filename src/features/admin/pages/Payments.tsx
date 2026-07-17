import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banknote, CheckCircle2, Clock3, CreditCard, DollarSign,
  ReceiptText, Search,
} from 'lucide-react'
import { Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { supabase } from '@/lib/supabase'
import { cn, formatDateTime, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_COLOR } from '@/lib/utils'
import type { Payment, PayoutRecord } from '@/types'
import { useCurrency } from '@/hooks/useCurrency'

type PayoutStatus = PayoutRecord['status']
type PayoutFilter = 'all' | PayoutStatus
type PaymentsTab = 'payouts' | 'payments'

interface PayoutRow extends PayoutRecord {
  profiles?: {
    username: string | null
    avatar_url: string | null
  } | null
  orders?: {
    id: string
    customer_id: string
    profiles?: { username: string | null } | null
  } | null
}

const payoutStatusLabel: Record<PayoutStatus, string> = {
  pending: 'A pagar',
  processing: 'Processando',
  paid: 'Pago',
  failed: 'Falhou',
}

const payoutStatusColor: Record<PayoutStatus, string> = {
  pending: 'text-warning bg-warning/10 border-warning/20',
  processing: 'text-brand bg-brand/10 border-brand/20',
  paid: 'text-success bg-success/10 border-success/20',
  failed: 'text-danger bg-danger/10 border-danger/20',
}

function StatusBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold', className)}>
      {children}
    </span>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: React.ElementType
  tone: string
}) {
  return (
    <Card padding="md" className="min-w-0">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-ink-muted">{label}</p>
          <p className="truncate text-lg font-black text-ink">{value}</p>
        </div>
      </div>
    </Card>
  )
}

function sumByStatus(rows: PayoutRow[] | undefined, status: PayoutStatus) {
  return rows?.filter((row) => row.status === status).reduce((sum, row) => sum + row.net_amount, 0) ?? 0
}

export function AdminPaymentsPage() {
  const currency = useCurrency()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<PaymentsTab>('payments')
  const [payoutFilter, setPayoutFilter] = useState<PayoutFilter>('pending')
  const [search, setSearch] = useState('')

  const { data: payouts, isLoading: loadingPayouts } = useQuery({
    queryKey: ['admin-payouts'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('payout_records')
        .select('*, profiles:booster_id(username, avatar_url), orders:order_id(id, customer_id, profiles:customer_id(username))')
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data as PayoutRow[]
    },
  })

  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150)
      if (error) throw error
      return data as Payment[]
    },
  })

  const updatePayout = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PayoutStatus }) => {
      const patch = {
        status,
        paid_at: status === 'paid' ? new Date().toISOString() : null,
      }
      const { error } = await supabase.from('payout_records').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-payouts'] })
    },
  })

  const filteredPayouts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (payouts ?? []).filter((row) => {
      if (payoutFilter !== 'all' && row.status !== payoutFilter) return false
      if (!query) return true

      return [
        row.profiles?.username,
        row.booster_id,
        row.order_id,
        row.orders?.customer_id,
      ].some((value) => value?.toLowerCase().includes(query))
    })
  }, [payoutFilter, payouts, search])

  const boosterSummary = useMemo(() => {
    const rows = filteredPayouts.filter((row) => row.status === 'pending' || row.status === 'processing')
    const grouped = new Map<string, { boosterId: string; name: string; amount: number; count: number }>()

    for (const row of rows) {
      const current = grouped.get(row.booster_id) ?? {
        boosterId: row.booster_id,
        name: row.profiles?.username ?? 'Booster',
        amount: 0,
        count: 0,
      }
      current.amount += row.net_amount
      current.count += 1
      grouped.set(row.booster_id, current)
    }

    return [...grouped.values()].sort((a, b) => b.amount - a.amount).slice(0, 6)
  }, [filteredPayouts])

  const pendingTotal = sumByStatus(payouts, 'pending')
  const paidTotal = sumByStatus(payouts, 'paid')
  const collectedTotal = payments?.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="section-label mb-2">Financeiro</p>
          <h1 className="text-2xl font-bold text-ink">Pagamentos</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
            Controle os repasses dos boosters e acompanhe os pagamentos recebidos dos clientes.
          </p>
        </div>

        <div className="flex rounded-xl border border-bg-elevated bg-bg-surface p-1">
          <button
            type="button"
            onClick={() => setTab('payments')}
            className={cn('rounded-lg px-3 py-2 text-sm font-bold transition-colors', tab === 'payments' ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink')}
          >
            Recebimentos
          </button>
          <button
            type="button"
            onClick={() => setTab('payouts')}
            className={cn('rounded-lg px-3 py-2 text-sm font-bold transition-colors', tab === 'payouts' ? 'bg-brand text-white' : 'text-ink-secondary hover:text-ink')}
          >
            Repasses
          </button>
        </div>
      </div>

      {tab === 'payouts' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="A pagar" value={currency(pendingTotal)} icon={Clock3} tone="bg-warning/10 text-warning" />
            <StatCard label="Pagos" value={currency(paidTotal)} icon={CheckCircle2} tone="bg-success/10 text-success" />
          </div>

          {boosterSummary.length > 0 && (
            <Card padding="md">
              <div className="mb-4 flex items-center gap-2">
                <Banknote className="h-4 w-4 text-brand" />
                <h2 className="text-sm font-bold text-ink">Boosters com saldo para sacar</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {boosterSummary.map((booster) => (
                  <div key={booster.boosterId} className="rounded-xl border border-bg-elevated bg-bg-elevated/30 p-4">
                    <p className="truncate text-sm font-bold text-ink">{booster.name}</p>
                    <p className="mt-1 text-xl font-black text-success">{currency(booster.amount)}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {booster.count} {booster.count === 1 ? 'repasse pendente' : 'repasses pendentes'}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card padding="none">
            <div className="flex flex-col gap-3 border-b border-bg-elevated p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {(['pending', 'processing', 'paid', 'failed', 'all'] as PayoutFilter[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setPayoutFilter(status)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors',
                      payoutFilter === status
                        ? 'border-brand bg-brand text-white'
                        : 'border-bg-elevated text-ink-secondary hover:border-brand/40 hover:text-ink',
                    )}
                  >
                    {status === 'all' ? 'Todos' : payoutStatusLabel[status]}
                  </button>
                ))}
              </div>

              <label className="relative block w-full lg:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar booster, pedido ou cliente"
                  className="input-base h-9 w-full pl-9 text-sm"
                />
              </label>
            </div>

            {loadingPayouts ? (
              <div className="p-4">
                <Skeleton className="h-56 w-full" />
              </div>
            ) : filteredPayouts.length === 0 ? (
              <EmptyState icon={Banknote} title="Nenhum repasse encontrado." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booster</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor do cliente</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Valor a sacar</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Datas</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayouts.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div>
                          <p className="font-bold text-ink">{row.profiles?.username ?? 'Booster'}</p>
                          <p className="font-mono text-[10px] text-ink-muted">{row.booster_id.slice(0, 8).toUpperCase()}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-bold text-brand">{row.order_id.slice(0, 8).toUpperCase()}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-ink-secondary">
                          {row.orders?.profiles?.username ?? (row.orders?.customer_id ? `${row.orders.customer_id.slice(0, 8).toUpperCase()}…` : '—')}
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold text-ink">{currency(row.gross_amount)}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold text-ink-secondary">{currency(row.commission_amount)}</p>
                          <p className="text-[10px] text-ink-muted">{Math.round(row.commission_rate * 100)}%</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-base font-black text-success">{currency(row.net_amount)}</TableCell>
                      <TableCell>
                        <StatusBadge className={payoutStatusColor[row.status]}>{payoutStatusLabel[row.status]}</StatusBadge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5 text-xs">
                          <p>{formatDateTime(row.created_at)}</p>
                          {row.paid_at && <p className="text-success">Pago {formatDateTime(row.paid_at)}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {row.status === 'pending' && (
                            <Button
                              size="xs"
                              variant="secondary"
                              loading={updatePayout.isPending}
                              onClick={() => updatePayout.mutate({ id: row.id, status: 'processing' })}
                            >
                              Processar
                            </Button>
                          )}
                          {row.status !== 'paid' && (
                            <Button
                              size="xs"
                              variant="success"
                              loading={updatePayout.isPending}
                              onClick={() => updatePayout.mutate({ id: row.id, status: 'paid' })}
                            >
                              Pago
                            </Button>
                          )}
                          {row.status !== 'failed' && row.status !== 'paid' && (
                            <Button
                              size="xs"
                              variant="danger-ghost"
                              loading={updatePayout.isPending}
                              onClick={() => updatePayout.mutate({ id: row.id, status: 'failed' })}
                            >
                              Falhou
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="Recebido do cliente" value={currency(collectedTotal)} icon={DollarSign} tone="bg-success/10 text-success" />
            <StatCard label="Pedidos listados" value={String(payments?.length ?? 0)} icon={ReceiptText} tone="bg-brand/10 text-brand" />
          </div>

          <Card padding="none">
            {loadingPayments ? (
              <div className="p-4">
                <Skeleton className="h-48 w-full" />
              </div>
            ) : !payments?.length ? (
              <EmptyState icon={CreditCard} title="Nenhum pagamento encontrado." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID Mercado Pago</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <span className="font-mono text-xs text-ink-secondary">{payment.mp_payment_id.slice(-12)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-bold text-brand">{payment.order_id.slice(0, 8).toUpperCase()}</span>
                      </TableCell>
                      <TableCell className="font-semibold text-ink">{currency(payment.amount)}</TableCell>
                      <TableCell className="capitalize">{payment.payment_method_type ?? '—'}</TableCell>
                      <TableCell>
                        <StatusBadge className={PAYMENT_STATUS_COLOR[payment.status] ?? 'border-bg-overlay bg-bg-elevated text-ink-muted'}>
                          {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>{formatDateTime(payment.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
