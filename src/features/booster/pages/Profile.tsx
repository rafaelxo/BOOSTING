import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, Trophy, TrendingUp } from 'lucide-react'
import { Card, Avatar, Skeleton, BoosterStatusBadge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatRank } from '@/lib/utils'
import type { BoosterProfile } from '@/types'
import { useTranslation } from 'react-i18next'
import { AvatarIconPicker } from '@/components/profile/AvatarIconPicker'
import { PasswordCard } from '@/components/profile/PasswordCard'
import { BoosterApplicationForm } from '@/features/booster/components/BoosterApplicationForm'

export function BoosterProfilePage() {
  const { profile, setProfile } = useAuthStore()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [usernameSaving, setUsernameSaving] = useState(false)
  const [usernameSaved, setUsernameSaved] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [appSaved, setAppSaved] = useState(false)

  const { data: boosterProfile, isLoading } = useQuery({
    queryKey: ['booster-profile-full', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('booster_profiles').select('*').eq('user_id', profile!.id).single()
      if (error) throw error
      return data as unknown as BoosterProfile
    },
    enabled: !!profile?.id,
  })

  async function handleSelectIcon(url: string) {
    if (!profile) return
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
    setProfile({ ...profile, avatar_url: url })
  }

  async function handleSaveUsername() {
    if (!profile || !username.trim()) return
    setUsernameSaving(true)
    setUsernameError(null)
    const { data: result, error } = await supabase.rpc('update_my_username', { p_username: username.trim() })
    setUsernameSaving(false)
    const res = result as { success: boolean; error?: string } | null
    if (error || !res?.success) {
      setUsernameError(res?.error === 'username_taken' ? 'Nome já em uso' : 'Erro ao salvar')
      return
    }
    setProfile({ ...profile, username: username.trim() })
    setUsernameSaved(true)
    setTimeout(() => setUsernameSaved(false), 3000)
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!boosterProfile) return null

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-ink">{t('booster.profile.title')}</h1>

      {/* Reputação (somente leitura) */}
      <Card padding="lg">
        <div className="flex items-start gap-5">
          <Avatar src={profile?.avatar_url} name={boosterProfile.display_name} size="xl" online={boosterProfile.is_available} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-ink">{boosterProfile.display_name}</h2>
              <BoosterStatusBadge status={boosterProfile.status} />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Star className="h-4 w-4 fill-accent text-accent" />
              <span className="text-sm font-semibold text-ink">{boosterProfile.rating.toFixed(1)}</span>
              <span className="text-xs text-ink-muted">{t('booster.profile.reviews', { count: boosterProfile.rating_count })}</span>
            </div>
          </div>
        </div>
        {boosterProfile.bio && (
          <p className="mt-4 text-sm text-ink-secondary leading-relaxed">{boosterProfile.bio}</p>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card padding="md" className="text-center">
          <Trophy className="h-6 w-6 text-accent mx-auto mb-2" />
          <p className="text-2xl font-bold text-ink">{boosterProfile.total_completed}</p>
          <p className="text-xs text-ink-secondary">{t('booster.profile.ordersDone')}</p>
        </Card>
        <Card padding="md" className="text-center">
          <Star className="h-6 w-6 fill-accent text-accent mx-auto mb-2" />
          <p className="text-2xl font-bold text-ink">{boosterProfile.rating.toFixed(1)}</p>
          <p className="text-xs text-ink-secondary">{t('booster.profile.avgRating')}</p>
        </Card>
        <Card padding="md" className="text-center">
          <TrendingUp className="h-6 w-6 text-brand mx-auto mb-2" />
          <p className="text-sm font-bold text-ink">
            {boosterProfile.peak_rank
              ? formatRank(boosterProfile.peak_rank.tier, boosterProfile.peak_rank.division)
              : '—'}
          </p>
          <p className="text-xs text-ink-secondary">{t('booster.profile.peakRank')}</p>
        </Card>
      </div>

      {/* Conta — igual a todo outro tipo de usuário */}
      <Card padding="md">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-4">Conta</p>
        <div className="space-y-2 mb-5">
          <label className="text-xs text-ink-muted">Nome de usuário</label>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => { setUsername(e.target.value); setUsernameError(null) }}
              maxLength={24}
              className="input-base flex-1 text-sm"
            />
            <button
              type="button"
              onClick={handleSaveUsername}
              disabled={usernameSaving || !username.trim() || username === profile?.username}
              className="px-3 py-2 rounded-xl bg-brand text-white text-xs font-bold hover:bg-brand/90 disabled:opacity-40 transition-colors shrink-0"
            >
              {usernameSaving ? '...' : 'Salvar'}
            </button>
          </div>
          {usernameError && <p className="text-xs text-danger">{usernameError}</p>}
          {usernameSaved && <p className="text-xs text-success">Nome salvo!</p>}
        </div>
        <div className="space-y-2">
          <label className="text-xs text-ink-muted">Email</label>
          <p className="text-sm text-ink">{profile?.email}</p>
          <p className="text-[11px] text-ink-muted">Gerenciado pela sua conta Discord.</p>
        </div>
      </Card>

      <Card padding="md">
        <AvatarIconPicker currentUrl={profile?.avatar_url} onSelect={handleSelectIcon} />
      </Card>

      <PasswordCard />

      {/* Dados da candidatura — os mesmos campos preenchidos em /apply */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-3">Dados da Candidatura</p>
        <BoosterApplicationForm
          submitLabel="Salvar Dados"
          initialData={{
            full_name: boosterProfile.full_name ?? '',
            cpf: boosterProfile.cpf ?? '',
            opgg_link: boosterProfile.opgg_link ?? '',
            bio: boosterProfile.bio ?? '',
            peak_tier: (boosterProfile.peak_rank?.tier as 'grandmaster' | 'challenger') ?? undefined,
            can_coach: boosterProfile.can_coach ?? false,
            available_days: boosterProfile.available_days ?? [],
            hours_per_day_min: boosterProfile.hours_per_day_min ?? 2,
            hours_per_day_max: boosterProfile.hours_per_day_max ?? 8,
          }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['booster-profile-full', profile?.id] })
            setAppSaved(true)
            setTimeout(() => setAppSaved(false), 3000)
          }}
        />
        {appSaved && <p className="text-xs text-success mt-2">Dados salvos com sucesso!</p>}
      </div>
    </div>
  )
}
