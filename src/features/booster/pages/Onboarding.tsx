import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FormField, Input, Card } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { RANK_TIER_LABEL, RANK_TIER_ORDER, cn } from '@/lib/utils'
import type { RankTier } from '@/types'

const schema = z.object({
  display_name: z.string().min(2).max(32),
  bio: z.string().max(500),
  peak_tier: z.string().min(1, 'Select your peak rank'),
})

type FormData = z.infer<typeof schema>

const GAME_OPTIONS = ['lol', 'valorant', 'tft'] as const
const SERVER_OPTIONS = ['NA', 'EUW', 'EUNE', 'BR', 'KR', 'OCE']

export function BoosterOnboardingPage() {
  const { profile } = useAuthStore()
  const navigate = useNavigate()
  const [selectedGames, setSelectedGames] = useState<string[]>(['lol'])
  const [selectedServers, setSelectedServers] = useState<string[]>(['NA'])
  const [peakTier, setPeakTier] = useState<RankTier | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    if (!profile) return

    const { error } = await supabase.from('booster_profiles').upsert({
      user_id: profile.id,
      display_name: data.display_name,
      bio: data.bio || null,
      status: 'pending',
      games: selectedGames,
      region_preferences: selectedServers,
      queue_preferences: ['solo_duo', 'flex'],
      peak_rank: peakTier ? { tier: peakTier, division: null } : null,
      current_rank: null,
      total_completed: 0,
      total_earnings: 0,
      rating: 0,
      rating_count: 0,
      is_available: false,
    })

    if (!error) navigate('/booster')
  }

  function toggle<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Complete Your Booster Profile</h1>
        <p className="text-sm text-ink-secondary mt-1">
          Fill in your details and our team will review your application.
        </p>
      </div>

      <Card padding="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <FormField label="Display Name" error={errors.display_name?.message} required>
            <Input placeholder="YourBoosterName" {...register('display_name')} />
          </FormField>

          <FormField label="Bio" hint="Tell customers about your experience and style.">
            <textarea
              placeholder="e.g. Diamond 1 ADC main, 5+ years of boosting experience..."
              className="input-base min-h-[80px] resize-none"
              {...register('bio')}
            />
          </FormField>

          <FormField label="Peak Rank" error={errors.peak_tier?.message} required>
            <div className="flex flex-wrap gap-1.5">
              {RANK_TIER_ORDER.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setPeakTier(tier)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                    peakTier === tier
                      ? 'border-brand bg-brand-muted text-brand'
                      : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30'
                  )}
                >
                  {RANK_TIER_LABEL[tier]}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="Games" required>
            <div className="flex gap-2">
              {GAME_OPTIONS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectedGames(toggle(selectedGames, g))}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-all uppercase',
                    selectedGames.includes(g)
                      ? 'border-brand bg-brand-muted text-brand'
                      : 'border-bg-elevated bg-bg-card text-ink-muted hover:border-brand/30'
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="Servers" required>
            <div className="flex flex-wrap gap-1.5">
              {SERVER_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedServers(toggle(selectedServers, s))}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                    selectedServers.includes(s)
                      ? 'border-brand bg-brand-muted text-brand'
                      : 'border-bg-elevated bg-bg-card text-ink-secondary hover:border-brand/30'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </FormField>

          <Button type="submit" className="w-full" loading={isSubmitting}>
            Submit Application
          </Button>
        </form>
      </Card>
    </div>
  )
}
