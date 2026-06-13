import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
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

  if (!booster) return null

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link to="/admin/boosters"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-bold text-ink">{booster.display_name}</h1>
        <BoosterStatusBadge status={booster.status} />
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

      {booster.bio && (
        <Card padding="md">
          <h3 className="text-sm font-semibold text-ink mb-2">Biografia</h3>
          <p className="text-sm text-ink-secondary">{booster.bio}</p>
        </Card>
      )}
    </div>
  )
}
