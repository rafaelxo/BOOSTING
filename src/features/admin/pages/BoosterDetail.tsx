import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Trophy, Swords, Users } from 'lucide-react'
import { Button, Card, BoosterStatusBadge, Avatar } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatDate, formatRank } from '@/lib/utils'
import { useCurrency } from '@/hooks/useCurrency'
import type { BoosterProfile } from '@/types'

export function AdminBoosterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const currency = useCurrency()

  const { data: booster } = useQuery({
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

  if (!booster) return null

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="icon"><Link to="/admin/boosters"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-bold text-ink">{booster.display_name}</h1>
        <BoosterStatusBadge status={booster.status} />
        {booster.is_top5 && (
          <span className="flex items-center gap-1 text-xs font-bold bg-warning/10 text-warning border border-warning/20 rounded-lg px-2.5 py-1 uppercase tracking-wide">
            <Trophy className="h-3 w-3" /> TOP 5
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card padding="md">
          <div className="flex items-start gap-4 mb-4">
            <Avatar name={booster.display_name} size="lg" online={booster.is_available} />
            <div>
              <p className="font-bold text-ink">{booster.display_name}</p>
              <p className="text-sm text-ink-secondary">
                {booster.peak_rank ? formatRank(booster.peak_rank.tier, booster.peak_rank.division) : 'Sem rank de pico'}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              ['Jogos', booster.games.join(', ')],
              ['Regiões', booster.region_preferences.join(', ')],
              ['Entrou em', formatDate(booster.created_at)],
              ['Verificado', booster.verified_at ? formatDate(booster.verified_at) : 'Ainda não'],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between text-sm">
                <span className="text-ink-muted">{l}</span>
                <span className="text-ink font-medium">{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card padding="md">
          <h3 className="text-sm font-semibold text-ink mb-4">Desempenho</h3>
          <div className="space-y-3">
            {[
              ['Pedidos Concluídos', booster.total_completed],
              ['Total Ganho', currency(booster.total_earnings)],
              ['Avaliação', `${booster.rating.toFixed(1)} ⭐ (${booster.rating_count} avaliações)`],
            ].map(([l, v]) => (
              <div key={l as string} className="flex justify-between text-sm">
                <span className="text-ink-muted">{l as string}</span>
                <span className="text-ink font-medium">{String(v)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {slotInfo && (
        <Card padding="md">
          <h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
            Uso de Slots
            <span className="text-[10px] font-normal text-ink-muted">
              ({slotInfo.is_top5 ? 'Top5: máx 3 pedidos / 2 duo' : 'Normal: máx 2 pedidos / 1 duo'})
            </span>
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Solo Ativos', value: slotInfo.solo_count, icon: Swords, color: 'text-brand bg-brand-muted' },
              { label: 'Duo Ativos', value: `${slotInfo.duo_count}/${slotInfo.max_duo}`, icon: Users, color: 'text-accent bg-accent/10' },
              { label: 'Total', value: `${slotInfo.total_count}/${slotInfo.max_total}`, icon: Trophy, color: slotInfo.total_count >= slotInfo.max_total ? 'text-danger bg-danger/10' : 'text-success bg-success/10' },
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

      {booster.bio && (
        <Card padding="md">
          <h3 className="text-sm font-semibold text-ink mb-2">Biografia</h3>
          <p className="text-sm text-ink-secondary">{booster.bio}</p>
        </Card>
      )}
    </div>
  )
}
