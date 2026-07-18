import { useState } from 'react'
import { Wallet, Banknote, PiggyBank, Hourglass, Send, FileText, XCircle } from 'lucide-react'
import { Button, Card, Skeleton, EmptyState, StatCard, ErrorAlert } from '@/components/ui'
import { formatDateTime, cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useCurrency } from '@/hooks/useCurrency'
import {
  useBoosterPayoutTotals, useBoosterPayoutRequests, useRequestPayout, useCancelPayoutRequest,
  getPayoutProofSignedUrl,
} from '@/api/payouts'
import { useBoosterPanelFields } from '@/api/auth'
import type { PayoutRequestStatus } from '@/api/payouts'

const STATUS_LABEL: Record<PayoutRequestStatus, string> = {
  requested: 'Aguardando análise', under_review: 'Em revisão', approved: 'Aprovado — a pagar',
  paid: 'Pago', rejected: 'Rejeitado', canceled: 'Cancelado',
}
const STATUS_COLOR: Record<PayoutRequestStatus, string> = {
  requested: 'text-warning bg-warning/10', under_review: 'text-info bg-info/10',
  approved: 'text-brand bg-brand/10', paid: 'text-success bg-success/10',
  rejected: 'text-danger bg-danger/10', canceled: 'text-ink-muted bg-bg-elevated',
}

function RequestPayoutCard({ available }: { available: number }) {
  const { profile } = useAuthStore()
  const currency = useCurrency()
  const [amount, setAmount] = useState('')
  const requestPayout = useRequestPayout(profile?.id)

  const numericAmount = Number(amount.replace(',', '.'))
  const valid = numericAmount > 0 && numericAmount <= available

  return (
    <Card padding="md" className="ring-1 ring-brand/20">
      <div className="flex items-center gap-2 mb-3">
        <Send className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">Solicitar saque</h3>
      </div>
      <p className="text-xs text-ink-muted mb-4">
        Disponível: <span className="font-bold text-ink" data-tabular>{currency(available)}</span>
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0,00"
          className="input-base flex-1 text-sm"
          data-tabular
        />
        <Button
          loading={requestPayout.isPending}
          disabled={!valid}
          onClick={() => requestPayout.mutate(numericAmount, { onSuccess: () => setAmount('') })}
        >
          Solicitar
        </Button>
      </div>
      {amount && !valid && (
        <p className="text-xs text-danger mt-2">Informe um valor entre R$ 0,01 e {currency(available)}.</p>
      )}
      {requestPayout.isError && (
        <ErrorAlert className="mt-2" message={requestPayout.error instanceof Error ? requestPayout.error.message : 'Erro ao solicitar saque.'} />
      )}
    </Card>
  )
}

export function BoosterPaymentsPage() {
  const { profile } = useAuthStore()
  const currency = useCurrency()

  const { data: totals, isLoading: loadingTotals } = useBoosterPayoutTotals(profile?.id)
  const { data: requests, isLoading: loadingRequests } = useBoosterPayoutRequests(profile?.id)
  const { data: panelFields } = useBoosterPanelFields(profile?.id, true)
  const cancelRequest = useCancelPayoutRequest(profile?.id)

  const BALANCE_BOXES = [
    { label: 'Total Ganho', value: totals?.total_earned ?? 0, icon: Wallet, color: 'text-success bg-success/10' },
    { label: 'Disponível para saque', value: totals?.available_balance ?? 0, icon: PiggyBank, color: 'text-success bg-success/10' },
    { label: 'Reservado (em análise)', value: totals?.reserved ?? 0, icon: Hourglass, color: 'text-warning bg-warning/10' },
    { label: 'Total Pago', value: totals?.total_paid ?? 0, icon: Banknote, color: 'text-brand bg-brand/10' },
  ]

  async function viewProof(proofUrl: string) {
    const url = await getPayoutProofSignedUrl(proofUrl)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Pagamentos</h1>
        <p className="text-ink-secondary mt-1">Saldo, saques e histórico de solicitações.</p>
      </div>

      {panelFields && (
        <Card padding="md">
          <h3 className="text-sm font-semibold text-ink mb-3">Dados para saque</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><p className="text-xs text-ink-muted">Nome</p><p className="font-semibold text-ink">{panelFields.display_name ?? '—'}</p></div>
            <div><p className="text-xs text-ink-muted">Nome legal</p><p className="font-semibold text-ink">{panelFields.full_name ?? '—'}</p></div>
            <div><p className="text-xs text-ink-muted">CPF</p><p className="font-semibold text-ink" data-tabular>{panelFields.cpf ?? '—'}</p></div>
          </div>
          {(!panelFields.full_name || !panelFields.cpf) && (
            <p className="text-xs text-warning mt-3">Complete nome legal e CPF no seu perfil antes de solicitar um saque.</p>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {BALANCE_BOXES.map(({ label, value, icon, color }) => (
          <StatCard key={label} label={label} icon={icon} color={color} value={loadingTotals ? <Skeleton className="h-6 w-20" /> : currency(value)} />
        ))}
      </div>

      <RequestPayoutCard available={totals?.available_balance ?? 0} />

      <Card padding="md">
        <h3 className="text-sm font-semibold text-ink mb-4">Histórico de solicitações</h3>
        {loadingRequests ? (
          <Skeleton className="h-32 w-full" />
        ) : !requests?.length ? (
          <EmptyState icon={Wallet} title="Nenhuma solicitação de saque ainda." />
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-3 border-b border-border-subtle last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink" data-tabular>{currency(r.amount)}</p>
                  <p className="text-xs text-ink-muted">{formatDateTime(r.requested_at)}</p>
                  {r.admin_note && <p className="text-xs text-ink-secondary mt-0.5">{r.admin_note}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLOR[r.status])}>
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.status === 'paid' && r.proof_url && (
                    <Button size="xs" variant="secondary" leftIcon={<FileText className="h-3.5 w-3.5" />} onClick={() => viewProof(r.proof_url!)}>
                      Comprovante
                    </Button>
                  )}
                  {(r.status === 'requested' || r.status === 'under_review') && (
                    <Button size="xs" variant="danger-ghost" leftIcon={<XCircle className="h-3.5 w-3.5" />} loading={cancelRequest.isPending} onClick={() => cancelRequest.mutate(r.id)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
