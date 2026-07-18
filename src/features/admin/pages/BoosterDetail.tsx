import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Trophy, Swords, Users, CheckCircle2, XCircle, ExternalLink, ClipboardList } from 'lucide-react'
import { Button, Card, BoosterStatusBadge, Avatar, ErrorAlert, EmptyState } from '@/components/ui'
import { formatDate, formatDateTime, formatRank, formatLastSeen, timeAgo } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import {
  useAdminBoosterDetail, useBoosterPerformanceByRank, useBoosterAuditLog, useAdminApproveBooster,
  useAdminToggleBoosterTop3,
} from '@/api/boosters'
import { useBoosterSlotInfo } from '@/api/orders'

type RankBucket = 'gold_minus' | 'plat_diamond' | 'master_plus'
const BRACKET_LABEL: Record<RankBucket, string> = {
  gold_minus: 'Ouro e abaixo',
  plat_diamond: 'Platina–Diamante',
  master_plus: 'Mestre+',
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  'booster.approved': 'Booster aprovado',
  'booster.rejected': 'Candidatura rejeitada',
  'booster.suspended': 'Booster suspenso',
  'booster.under_review': 'Candidatura em revisão',
  'booster.top3_granted': 'Marcado como Top3',
  'booster.top3_removed': 'Removido do Top3',
}

function safeOpggUrl(url: string | null): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined
    return parsed.toString()
  } catch {
    return undefined
  }
}

const DAY_LABEL: Record<string, string> = { mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom' }

export function AdminBoosterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const currency = useCurrency()

  const { data: booster, isLoading } = useAdminBoosterDetail(id)
  const { data: slotInfo } = useBoosterSlotInfo(booster?.user_id, booster?.status === 'approved')

  // Desempenho por faixa de elo -- calculado automaticamente a partir de
  // partidas reais sincronizadas (order_matches) e reviews, nunca digitado
  // à mão (ver refresh_booster_performance_segments, migration 054).
  const { data: performanceSegments } = useBoosterPerformanceByRank(booster?.user_id)

  // Trilha de auditoria pra controle admin -- aprovação/rejeição/suspensão e
  // mudanças de Top3 (approve_booster / toggle_booster_top3).
  const { data: auditLog } = useBoosterAuditLog(id)

  const updateStatusMutation = useAdminApproveBooster()
  const updateStatus = {
    isPending: updateStatusMutation.isPending,
    isError: updateStatusMutation.isError,
    isSuccess: updateStatusMutation.isSuccess,
    error: updateStatusMutation.error,
    mutate: (status: 'approved' | 'rejected' | 'suspended') =>
      updateStatusMutation.mutate({ boosterId: id!, newStatus: status }),
  }

  const toggleTop3Mutation = useAdminToggleBoosterTop3()

  if (isLoading) return null
  if (!booster) return <p className="text-ink-muted">Booster não encontrado.</p>

  const isPending = booster.status === 'pending' || booster.status === 'under_review'
  const hasStats = !!performanceSegments?.some(s => s.total_matches > 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar">
          <Link to="/admin/boosters"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold text-ink">{booster.display_name}</h1>
        <BoosterStatusBadge status={booster.status} />
        {booster.is_top3 && (
          <span className="flex items-center gap-1 text-xs font-bold bg-warning/10 text-warning border border-warning/20 rounded-lg px-2.5 py-1 uppercase tracking-wide">
            <Trophy className="h-3 w-3" /> TOP 3
          </span>
        )}
        {booster.status === 'approved' && (
          <Button
            variant={booster.is_top3 ? 'secondary' : 'ghost'}
            size="sm"
            leftIcon={<Trophy className="h-3.5 w-3.5" />}
            loading={toggleTop3Mutation.isPending}
            onClick={() => toggleTop3Mutation.mutate({ boosterId: booster.id, isTop3: !booster.is_top3 })}
            className="ml-auto"
          >
            {booster.is_top3 ? 'Remover do Top 3' : 'Marcar como Top 3'}
          </Button>
        )}
      </div>

      {/* Action buttons for pending boosters */}
      {isPending && (
        <Card padding="md">
          <p className="text-sm font-semibold text-ink mb-3">Decisão sobre a candidatura</p>
          <div className="flex gap-3">
            <Button
              variant="success"
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
              loading={updateStatus.isPending}
              onClick={() => updateStatus.mutate('approved')}
              className="flex-1"
            >
              Aprovar Booster
            </Button>
            <Button
              variant="danger"
              leftIcon={<XCircle className="h-4 w-4" />}
              loading={updateStatus.isPending}
              onClick={() => updateStatus.mutate('rejected')}
              className="flex-1"
            >
              Rejeitar
            </Button>
          </div>
          {updateStatus.isError && (
            <ErrorAlert message={(updateStatus.error as Error).message} className="mt-2" />
          )}
          {updateStatus.isSuccess && (
            <p className="text-success text-xs mt-2">Status atualizado com sucesso.</p>
          )}
        </Card>
      )}

      {booster.status === 'approved' && (
        <Card padding="md">
          <div className="flex gap-3">
            <Button
              variant="danger-ghost"
              size="sm"
              loading={updateStatus.isPending}
              onClick={() => updateStatus.mutate('suspended')}
            >
              Suspender Booster
            </Button>
          </div>
        </Card>
      )}

      {booster.status === 'suspended' && (
        <Card padding="md">
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              loading={updateStatus.isPending}
              onClick={() => updateStatus.mutate('approved')}
            >
              Reativar Booster
            </Button>
          </div>
        </Card>
      )}

      {/* Dados da candidatura -- replica o que foi submetido no formulário
          (BoosterApplicationForm), pra fins de verificação/controle. Não é
          o perfil profissional (isso o cliente já vê na página pública). */}
      <div className="grid md:grid-cols-2 gap-5">
        <Card padding="md">
          <div className="flex items-start gap-4 mb-4">
            <Avatar name={booster.display_name} size="lg" />
            <div>
              <p className="font-bold text-ink">{booster.display_name}</p>
              <p className="text-sm text-ink-secondary">
                {booster.peak_rank ? formatRank(booster.peak_rank.tier, booster.peak_rank.division) : 'Sem rank de pico'}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">{formatLastSeen(booster.last_active_at)}</p>
              {safeOpggUrl(booster.opgg_link) && (
                <a
                  href={safeOpggUrl(booster.opgg_link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-brand hover:underline mt-1"
                >
                  <ExternalLink className="h-3 w-3" /> OP.GG
                </a>
              )}
            </div>
          </div>
          <div className="space-y-2 text-sm">
            {[
              ['Entrou em', formatDate(booster.created_at)],
              ['Verificado', booster.verified_at ? formatDate(booster.verified_at) : 'Ainda não'],
              ['Disponibilidade', booster.available_days?.length
                ? booster.available_days.map(d => DAY_LABEL[d] ?? d).join(', ')
                : 'Não informado'],
              ['Carga horária', booster.hours_per_day_min || booster.hours_per_day_max
                ? `${booster.hours_per_day_min ?? '?'}–${booster.hours_per_day_max ?? '?'} h/dia`
                : 'Não informado'],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between gap-4">
                <span className="text-ink-muted shrink-0">{l}</span>
                <span className="text-ink font-medium text-right">{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card padding="md">
          <h3 className="text-sm font-semibold text-ink mb-3">Dados Pessoais / PIX</h3>
          <div className="space-y-2 text-sm">
            {[
              ['Nome completo', booster.full_name ?? '—'],
              ['Email', booster.email ?? '—'],
              ['CPF', booster.cpf ? booster.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—'],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between gap-4">
                <span className="text-ink-muted shrink-0">{l}</span>
                <span className="text-ink font-medium text-right break-all">{v}</span>
              </div>
            ))}
          </div>
          {booster.bio && (
            <div className="mt-3 pt-3 border-t border-bg-elevated">
              <p className="text-xs text-ink-muted mb-1">Bio (candidatura)</p>
              <p className="text-sm text-ink-secondary leading-relaxed">{booster.bio}</p>
            </div>
          )}
        </Card>
      </div>

      {/* Performance */}
      <Card padding="md">
        <h3 className="text-sm font-semibold text-ink mb-3">Desempenho</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: 'Pedidos', value: booster.total_completed },
            { label: 'Ganhos', value: currency(booster.total_earnings) },
            { label: 'Rating', value: booster.rating.toFixed(1) },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-lg font-bold text-ink">{value}</p>
              <p className="text-xs text-ink-muted">{label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Estatísticas por faixa de elo -- somente leitura, calculadas
          automaticamente a partir de partidas reais sincronizadas. */}
      <Card padding="md">
        <h3 className="text-sm font-semibold text-ink mb-1">Estatísticas por Faixa de Elo</h3>
        <p className="text-xs text-ink-muted mb-4">
          Calculado automaticamente a partir das partidas sincronizadas dos pedidos concluídos -- mesmos dados exibidos no perfil público.
        </p>
        {!hasStats ? (
          <p className="text-xs text-ink-muted py-4 text-center">Ainda sem partidas suficientes para gerar estatísticas.</p>
        ) : (
          <div className="space-y-3">
            {(Object.keys(BRACKET_LABEL) as RankBucket[]).map((bracket) => {
              const stats = performanceSegments?.find(s => s.rank_bucket === bracket)
              if (!stats || stats.total_matches === 0) return null
              return (
                <div key={bracket} className="flex items-center justify-between py-2 border-b border-bg-elevated last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-ink">{BRACKET_LABEL[bracket]}</p>
                    <p className="text-[10px] text-ink-muted">{stats.total_matches} partida{stats.total_matches === 1 ? '' : 's'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-6 text-right">
                    <div>
                      <p className="text-[10px] text-ink-muted">KDA Médio</p>
                      <p className="text-sm font-bold text-ink">{stats.average_kda != null ? stats.average_kda.toFixed(1) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-ink-muted">Winrate</p>
                      <p className="text-sm font-bold text-brand">{Math.round((stats.adjusted_win_rate ?? 0) * 100)}%</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Active slots */}
      {slotInfo && (
        <Card padding="md">
          <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            Uso de Slots
            <span className="text-[10px] font-normal text-ink-muted">
              ({slotInfo.is_top3 ? 'Top3: máx 3 / 2 duo' : 'Normal: máx 3 / 1 duo'})
            </span>
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Solo', value: slotInfo.solo_count, icon: Swords, color: 'text-brand bg-brand/10' },
              { label: 'Duo',  value: `${slotInfo.duo_count}/${slotInfo.max_duo}`, icon: Users, color: 'text-accent bg-accent/10' },
              { label: 'Total', value: `${slotInfo.total_count}/${slotInfo.max_total}`, icon: Trophy,
                color: (slotInfo.total_count ?? 0) >= (slotInfo.max_total ?? 3) ? 'text-danger bg-danger/10' : 'text-success bg-success/10' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="text-center">
                <div className={`h-9 w-9 rounded-xl ${color} flex items-center justify-center mx-auto mb-2`}>
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-lg font-bold text-ink">{value}</p>
                <p className="text-[10px] text-ink-muted">{label}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Atividade -- trilha de auditoria pra controle admin */}
      <Card padding="md">
        <h3 className="text-sm font-semibold text-ink mb-3">Atividade</h3>
        {!auditLog?.length ? (
          <EmptyState icon={ClipboardList} title="Nenhum evento registrado" />
        ) : (
          <div className="space-y-3">
            {auditLog.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</span>
                <span className="text-xs text-ink-muted" title={formatDateTime(entry.created_at)}>{timeAgo(entry.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
