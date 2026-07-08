import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trophy, Swords, Users, CheckCircle2, XCircle, ExternalLink, Save } from 'lucide-react'
import { Button, Card, BoosterStatusBadge, Avatar } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatDate, formatRank, RANK_TIER_ORDER, RANK_TIER_LABEL } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import type { BoosterProfile, RankTier, Division } from '@/types'

const DIVISIONS: Division[] = ['IV', 'III', 'II', 'I']
const MASTER_PLUS: RankTier[] = ['master', 'grandmaster', 'challenger']

type RankStatsBracket = 'gold_minus' | 'plat_diamond' | 'master_plus'
const BRACKET_LABEL: Record<RankStatsBracket, string> = {
  gold_minus: 'Ouro-',
  plat_diamond: 'Platina–Diamante',
  master_plus: 'Mestre+',
}

interface RankStatsForm {
  current_tier: RankTier | ''
  current_division: Division | ''
  stats: Record<RankStatsBracket, { kda: string; winrate: string }>
}

function emptyStatsForm(): RankStatsForm {
  return {
    current_tier: '',
    current_division: '',
    stats: {
      gold_minus: { kda: '', winrate: '' },
      plat_diamond: { kda: '', winrate: '' },
      master_plus: { kda: '', winrate: '' },
    },
  }
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

export function AdminBoosterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const currency = useCurrency()

  const { data: booster, isLoading } = useQuery({
    queryKey: ['admin-booster', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('booster_profiles').select('*').eq('id', id!).single()
      if (error) throw error
      return data as unknown as BoosterProfile
    },
    enabled: !!id,
  })

  const { data: slotInfo } = useQuery({
    queryKey: ['admin-booster-slots', booster?.user_id],
    queryFn: async () => {
      const { data } = await supabase.rpc('can_booster_accept_order', {
        p_booster_user_id: booster!.user_id,
        p_boost_mode: 'solo',
      })
      return data as unknown as { solo_count: number; duo_count: number; total_count: number; max_total: number; max_duo: number; is_top5: boolean } | null
    },
    enabled: !!booster?.user_id && booster?.status === 'approved',
  })

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { data, error } = await supabase.rpc('approve_booster', { p_booster_id: id!, p_new_status: status })
      if (error) throw error
      const result = data as { success: boolean; error?: string }
      if (!result.success) throw new Error(result.error ?? 'Erro ao atualizar booster')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-booster', id] })
      queryClient.invalidateQueries({ queryKey: ['admin-boosters'] })
    },
  })

  // Estatísticas públicas (rank_stats / current_rank) — antes só editável
  // manualmente via SQL direto no banco; sem isso o pódio público e o perfil
  // público do booster nunca tinham dado real pra mostrar.
  const [statsForm, setStatsForm] = useState<RankStatsForm>(emptyStatsForm())

  useEffect(() => {
    if (!booster) return
    const s = booster.rank_stats
    setStatsForm({
      current_tier: booster.current_rank?.tier ?? '',
      current_division: booster.current_rank?.division ?? '',
      stats: {
        gold_minus: { kda: s?.gold_minus?.kda?.toString() ?? '', winrate: s?.gold_minus?.winrate?.toString() ?? '' },
        plat_diamond: { kda: s?.plat_diamond?.kda?.toString() ?? '', winrate: s?.plat_diamond?.winrate?.toString() ?? '' },
        master_plus: { kda: s?.master_plus?.kda?.toString() ?? '', winrate: s?.master_plus?.winrate?.toString() ?? '' },
      },
    })
  }, [booster])

  const saveStats = useMutation({
    mutationFn: async () => {
      const rankStats: Record<string, { kda: number; winrate: number }> = {}
      for (const bracket of Object.keys(statsForm.stats) as RankStatsBracket[]) {
        const { kda, winrate } = statsForm.stats[bracket]
        if (kda.trim() || winrate.trim()) {
          rankStats[bracket] = { kda: parseFloat(kda) || 0, winrate: parseFloat(winrate) || 0 }
        }
      }

      const currentRank = statsForm.current_tier
        ? { tier: statsForm.current_tier, division: MASTER_PLUS.includes(statsForm.current_tier) ? null : (statsForm.current_division || 'IV') }
        : null

      const { error } = await supabase
        .from('booster_profiles')
        .update({ current_rank: currentRank as never, rank_stats: rankStats as never })
        .eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-booster', id] }),
  })

  if (isLoading) return null
  if (!booster) return <p className="text-ink-muted">Booster não encontrado.</p>

  const isPending = booster.status === 'pending' || booster.status === 'under_review'

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="icon">
          <Link to="/admin/boosters"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-bold text-ink">{booster.display_name}</h1>
        <BoosterStatusBadge status={booster.status} />
        {booster.is_top5 && (
          <span className="flex items-center gap-1 text-xs font-bold bg-warning/10 text-warning border border-warning/20 rounded-lg px-2.5 py-1 uppercase tracking-wide">
            <Trophy className="h-3 w-3" /> TOP 5
          </span>
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
            <p className="text-danger text-xs mt-2">{(updateStatus.error as Error).message}</p>
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

      <div className="grid md:grid-cols-2 gap-5">
        {/* Profile overview */}
        <Card padding="md">
          <div className="flex items-start gap-4 mb-4">
            <Avatar name={booster.display_name} size="lg" online={booster.is_available} />
            <div>
              <p className="font-bold text-ink">{booster.display_name}</p>
              <p className="text-sm text-ink-secondary">
                {booster.peak_rank ? formatRank(booster.peak_rank.tier, booster.peak_rank.division) : 'Sem rank de pico'}
              </p>
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
              ['Entrou em',   formatDate(booster.created_at)],
              ['Verificado',  booster.verified_at ? formatDate(booster.verified_at) : 'Ainda não'],
              ['Disponível',  booster.hours_per_day_min || booster.hours_per_day_max
                ? `${booster.hours_per_day_min ?? '?'}–${booster.hours_per_day_max ?? '?'} h/dia`
                : 'Não informado'],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between">
                <span className="text-ink-muted">{l}</span>
                <span className="text-ink font-medium">{v}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Personal info / PIX */}
        <Card padding="md">
          <h3 className="text-sm font-semibold text-ink mb-3">Dados Pessoais / PIX</h3>
          <div className="space-y-2 text-sm">
            {[
              ['Nome completo', booster.full_name ?? '—'],
              ['Email',         booster.email    ?? '—'],
              ['CPF',           booster.cpf      ? booster.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—'],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between gap-4">
                <span className="text-ink-muted shrink-0">{l}</span>
                <span className="text-ink font-medium text-right break-all">{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Performance */}
      <Card padding="md">
        <h3 className="text-sm font-semibold text-ink mb-3">Desempenho</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: 'Pedidos', value: booster.total_completed },
            { label: 'Ganhos',  value: currency(booster.total_earnings) },
            { label: 'Rating',  value: booster.rating.toFixed(1) },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-lg font-bold text-ink">{value}</p>
              <p className="text-xs text-ink-muted">{label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Estatísticas públicas — current_rank + rank_stats */}
      <Card padding="md">
        <h3 className="text-sm font-semibold text-ink mb-1">Estatísticas Públicas</h3>
        <p className="text-xs text-ink-muted mb-4">
          Exibidas no pódio e no perfil público do booster (página /boosters).
        </p>

        <div className="space-y-1.5 mb-4">
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Rank Atual</label>
          <div className="flex gap-2">
            <select
              value={statsForm.current_tier}
              onChange={(e) => setStatsForm((f) => ({ ...f, current_tier: e.target.value as RankTier | '' }))}
              className="input-base flex-1 text-sm"
            >
              <option value="">— sem rank —</option>
              {RANK_TIER_ORDER.map((tier) => (
                <option key={tier} value={tier}>{RANK_TIER_LABEL[tier]}</option>
              ))}
            </select>
            {statsForm.current_tier && !MASTER_PLUS.includes(statsForm.current_tier) && (
              <select
                value={statsForm.current_division}
                onChange={(e) => setStatsForm((f) => ({ ...f, current_division: e.target.value as Division | '' }))}
                className="input-base w-24 text-sm"
              >
                {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {(Object.keys(BRACKET_LABEL) as RankStatsBracket[]).map((bracket) => (
            <div key={bracket} className="grid grid-cols-3 gap-2 items-end">
              <span className="text-xs font-semibold text-ink-secondary">{BRACKET_LABEL[bracket]}</span>
              <div className="space-y-1">
                <label className="text-[9px] text-ink-muted">KDA</label>
                <input
                  type="number" step="0.01" min="0"
                  value={statsForm.stats[bracket].kda}
                  onChange={(e) => setStatsForm((f) => ({
                    ...f, stats: { ...f.stats, [bracket]: { ...f.stats[bracket], kda: e.target.value } },
                  }))}
                  className="input-base w-full text-sm"
                  placeholder="ex: 3.5"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-ink-muted">Winrate %</label>
                <input
                  type="number" step="0.1" min="0" max="100"
                  value={statsForm.stats[bracket].winrate}
                  onChange={(e) => setStatsForm((f) => ({
                    ...f, stats: { ...f.stats, [bracket]: { ...f.stats[bracket], winrate: e.target.value } },
                  }))}
                  className="input-base w-full text-sm"
                  placeholder="ex: 62"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <Button
            size="sm"
            leftIcon={<Save className="h-3.5 w-3.5" />}
            loading={saveStats.isPending}
            onClick={() => saveStats.mutate()}
          >
            Salvar Estatísticas
          </Button>
          {saveStats.isSuccess && <span className="text-xs text-success">Salvo!</span>}
          {saveStats.isError && <span className="text-xs text-danger">{(saveStats.error as Error).message}</span>}
        </div>
      </Card>

      {/* Active slots */}
      {slotInfo && (
        <Card padding="md">
          <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            Uso de Slots
            <span className="text-[10px] font-normal text-ink-muted">
              ({slotInfo.is_top5 ? 'Top5: máx 3 / 2 duo' : 'Normal: máx 3 / 1 duo'})
            </span>
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Solo', value: slotInfo.solo_count, icon: Swords, color: 'text-brand bg-brand/10' },
              { label: 'Duo',  value: `${slotInfo.duo_count}/${slotInfo.max_duo}`, icon: Users, color: 'text-accent bg-accent/10' },
              { label: 'Total', value: `${slotInfo.total_count}/${slotInfo.max_total}`, icon: Trophy,
                color: slotInfo.total_count >= slotInfo.max_total ? 'text-danger bg-danger/10' : 'text-success bg-success/10' },
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

      {/* Bio */}
      {booster.bio && (
        <Card padding="md">
          <h3 className="text-sm font-semibold text-ink mb-2">Biografia</h3>
          <p className="text-sm text-ink-secondary leading-relaxed">{booster.bio}</p>
        </Card>
      )}
    </div>
  )
}
