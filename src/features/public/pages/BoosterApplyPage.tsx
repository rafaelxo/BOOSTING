import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { Shield, Clock, DollarSign, Zap, CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn, RANK_TIER_ORDER, RANK_TIER_LABEL } from '@/lib/utils'
import type { RankTier } from '@/types'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

const REGIONS = ['NA', 'EUW', 'EUNE', 'BR', 'KR', 'OCE', 'LAN', 'LAS', 'JP', 'TR', 'RU']

const ROLES = [
  { id: 'top',     label: 'Top'     },
  { id: 'jungle',  label: 'Jungle'  },
  { id: 'mid',     label: 'Mid'     },
  { id: 'adc',     label: 'ADC'     },
  { id: 'support', label: 'Support' },
  { id: 'fill',    label: 'Fill'    },
]

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const GAMES = [
  { id: 'league',   label: 'League of Legends' },
  { id: 'valorant', label: 'Valorant'           },
  { id: 'tft',      label: 'Teamfight Tactics'  },
]

type FormData = {
  summoner_name: string
  opgg_link: string
  region: string
  peak_tier: RankTier | ''
  roles: string[]
  games: string[]
  hours_per_week: string
  available_days: string[]
  years_experience: string
  motivation: string
  discord_tag: string
  has_coaching: boolean
  agreed_terms: boolean
}

type Step = 'form' | 'success'

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-ink mb-1.5">
      {children}{required && <span className="text-danger ml-0.5">*</span>}
    </label>
  )
}

function CheckPill({
  checked, onChange, label,
}: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        'px-3 py-2 rounded-xl text-sm font-medium border transition-all',
        checked
          ? 'bg-brand/15 border-brand text-brand'
          : 'border-bg-elevated text-ink-muted hover:border-bg-overlay hover:text-ink-secondary'
      )}
    >
      {checked && <CheckCircle2 className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />}
      {label}
    </button>
  )
}

export function BoosterApplyPage() {
  const { isAuthenticated, profile } = useAuthStore()
  const [step, setStep] = useState<Step>('form')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register, handleSubmit, control, watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      summoner_name: '',
      opgg_link: '',
      region: 'NA',
      peak_tier: '',
      roles: [],
      games: ['league'],
      hours_per_week: '',
      available_days: [],
      years_experience: '',
      motivation: '',
      discord_tag: '',
      has_coaching: false,
      agreed_terms: false,
    },
  })

  async function onSubmit(data: FormData) {
    setError(null)
    setSubmitting(true)
    try {
      const payload = {
        summoner_name: data.summoner_name,
        opgg_link: data.opgg_link || null,
        region: data.region,
        peak_rank: data.peak_tier,
        roles: data.roles,
        games: data.games,
        hours_per_week: parseInt(data.hours_per_week, 10),
        available_days: data.available_days,
        years_experience: parseFloat(data.years_experience),
        motivation: data.motivation,
        discord_tag: data.discord_tag || null,
        has_coaching: data.has_coaching,
        // attach user_id if already logged in
        user_id: isAuthenticated() ? profile?.id : null,
        status: 'pending',
      }

      const { error: dbErr } = await supabase
        .from('booster_applications')
        .insert(payload)

      if (dbErr) throw dbErr
      setStep('success')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'success') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center space-y-6"
        >
          <div className="h-20 w-20 rounded-full bg-success/15 border border-success/30 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-ink mb-3">Application received!</h1>
            <p className="text-ink-secondary leading-relaxed">
              We review every application manually. Expect a response via Discord or email
              within <strong className="text-ink">2–5 business days</strong>. We'll cover next
              steps if you're accepted.
            </p>
          </div>
          <div className="card p-5 text-left space-y-2 text-sm text-ink-secondary">
            <p className="font-semibold text-ink text-base mb-3">What happens next</p>
            {[
              'Manual review of your OP.GG and application details',
              'Short onboarding interview (Discord)',
              'Test match observation with a senior booster',
              'Account and payout setup',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="h-5 w-5 rounded-full bg-brand/15 text-brand text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <Button asChild size="lg" className="w-full">
            <Link to="/">Back to homepage</Link>
          </Button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="bg-bg-base">
      {/* Hero */}
      <div className="relative bg-bg-surface border-b border-bg-elevated overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-50 pointer-events-none" />
        <div className="max-w-screen-xl mx-auto px-5 sm:px-8 py-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
            >
              <p className="section-label mb-4">Join our team</p>
              <h1 className="text-4xl md:text-5xl font-black text-ink mb-5 leading-tight">
                Apply as a<br /><span className="text-gradient-brand">Professional Booster</span>
              </h1>
              <p className="text-ink-secondary text-lg leading-relaxed mb-8">
                Diamond+ players earn $15–$80 per order, set their own hours, and work
                with the most trusted boosting platform in the region.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: DollarSign, title: '$15–$80 per order',   sub: 'Paid weekly via PayPal/Wise' },
                  { icon: Clock,      title: 'Flexible hours',       sub: 'Pick which days you work'   },
                  { icon: Shield,     title: 'Protected sessions',   sub: 'VPN + encrypted credentials'},
                  { icon: Zap,        title: 'Fast onboarding',      sub: '2–5 days from application'  },
                ].map(({ icon: Icon, title, sub }) => (
                  <div key={title} className="flex gap-3">
                    <div className="h-10 w-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-brand" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink">{title}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <div className="hidden lg:flex items-center justify-center">
              <div className="card p-6 w-full max-w-xs space-y-4">
                <p className="section-label">Requirements</p>
                {[
                  '🏆 Diamond IV or higher (current season)',
                  '🎮 At least one mastered role',
                  '⏰ 10+ hours/week availability',
                  '💬 Basic English communication',
                  '📊 Verifiable OP.GG profile',
                ].map(req => (
                  <div key={req} className="flex items-start gap-2 text-sm text-ink-secondary">
                    <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                    <span>{req.slice(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-16">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
          {/* Section 1: Account info */}
          <div>
            <h2 className="text-xl font-bold text-ink mb-6 pb-3 border-b border-bg-elevated">
              Account Information
            </h2>
            <div className="space-y-5">
              <div>
                <FieldLabel required>Summoner Name</FieldLabel>
                <input
                  {...register('summoner_name', { required: 'Required' })}
                  placeholder="YourSummonerName"
                  className="input-base w-full"
                />
                {errors.summoner_name && <p className="text-danger text-xs mt-1">{errors.summoner_name.message}</p>}
              </div>

              <div>
                <FieldLabel>OP.GG Profile Link</FieldLabel>
                <input
                  {...register('opgg_link', {
                    pattern: {
                      value: /^https?:\/\//i,
                      message: 'Enter a valid URL',
                    },
                  })}
                  placeholder="https://op.gg/summoners/na/YourName"
                  className="input-base w-full"
                />
                {errors.opgg_link && <p className="text-danger text-xs mt-1">{errors.opgg_link.message}</p>}
              </div>

              <div>
                <FieldLabel required>Region</FieldLabel>
                <select {...register('region')} className="input-base w-full">
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <FieldLabel required>Peak Rank (current season)</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <Controller
                    name="peak_tier"
                    control={control}
                    rules={{ required: 'Select your peak rank' }}
                    render={({ field }) => (
                      <>
                        {RANK_TIER_ORDER.map(tier => (
                          <button
                            key={tier}
                            type="button"
                            onClick={() => field.onChange(tier)}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                              field.value === tier
                                ? 'border-brand bg-brand/15 text-brand'
                                : 'border-bg-elevated text-ink-muted hover:border-bg-overlay'
                            )}
                          >
                            {RANK_TIER_LABEL[tier]}
                          </button>
                        ))}
                      </>
                    )}
                  />
                </div>
                {errors.peak_tier && <p className="text-danger text-xs mt-1">{errors.peak_tier.message}</p>}
              </div>
            </div>
          </div>

          {/* Section 2: Play style */}
          <div>
            <h2 className="text-xl font-bold text-ink mb-6 pb-3 border-b border-bg-elevated">
              Play Style & Games
            </h2>
            <div className="space-y-5">
              <div>
                <FieldLabel required>Preferred Roles (select all that apply)</FieldLabel>
                <Controller
                  name="roles"
                  control={control}
                  rules={{ validate: v => v.length > 0 || 'Select at least one role' }}
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-2">
                      {ROLES.map(role => (
                        <CheckPill
                          key={role.id}
                          label={role.label}
                          checked={field.value.includes(role.id)}
                          onChange={() => {
                            const next = field.value.includes(role.id)
                              ? field.value.filter(r => r !== role.id)
                              : [...field.value, role.id]
                            field.onChange(next)
                          }}
                        />
                      ))}
                    </div>
                  )}
                />
                {errors.roles && <p className="text-danger text-xs mt-1">{errors.roles.message}</p>}
              </div>

              <div>
                <FieldLabel required>Games you can boost</FieldLabel>
                <Controller
                  name="games"
                  control={control}
                  rules={{ validate: v => v.length > 0 || 'Select at least one game' }}
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-2">
                      {GAMES.map(g => (
                        <CheckPill
                          key={g.id}
                          label={g.label}
                          checked={field.value.includes(g.id)}
                          onChange={() => {
                            const next = field.value.includes(g.id)
                              ? field.value.filter(x => x !== g.id)
                              : [...field.value, g.id]
                            field.onChange(next)
                          }}
                        />
                      ))}
                    </div>
                  )}
                />
                {errors.games && <p className="text-danger text-xs mt-1">{errors.games.message}</p>}
              </div>

              <div>
                <FieldLabel required>Coaching capability</FieldLabel>
                <Controller
                  name="has_coaching"
                  control={control}
                  render={({ field }) => (
                    <div className="flex gap-3">
                      {[
                        { v: true, label: 'Yes, I can coach' },
                        { v: false, label: 'Boosting only' },
                      ].map(({ v, label }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => field.onChange(v)}
                          className={cn(
                            'px-4 py-2 rounded-xl text-sm font-medium border transition-all',
                            field.value === v
                              ? 'border-brand bg-brand/15 text-brand'
                              : 'border-bg-elevated text-ink-muted hover:border-bg-overlay'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Availability */}
          <div>
            <h2 className="text-xl font-bold text-ink mb-6 pb-3 border-b border-bg-elevated">
              Availability
            </h2>
            <div className="space-y-5">
              <div>
                <FieldLabel required>Available days</FieldLabel>
                <Controller
                  name="available_days"
                  control={control}
                  rules={{ validate: v => v.length > 0 || 'Select at least one day' }}
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map(day => (
                        <CheckPill
                          key={day}
                          label={day.slice(0, 3)}
                          checked={field.value.includes(day)}
                          onChange={() => {
                            const next = field.value.includes(day)
                              ? field.value.filter(d => d !== day)
                              : [...field.value, day]
                            field.onChange(next)
                          }}
                        />
                      ))}
                    </div>
                  )}
                />
                {errors.available_days && <p className="text-danger text-xs mt-1">{errors.available_days.message}</p>}
              </div>

              <div>
                <FieldLabel required>Hours available per week</FieldLabel>
                <input
                  {...register('hours_per_week', {
                    required: 'Required',
                    min: { value: 1, message: 'At least 1 hour' },
                    max: { value: 80, message: 'Maximum 80 hours' },
                  })}
                  type="number"
                  min={1}
                  max={80}
                  placeholder="e.g. 20"
                  className="input-base w-40"
                />
                {errors.hours_per_week && <p className="text-danger text-xs mt-1">{errors.hours_per_week.message}</p>}
              </div>
            </div>
          </div>

          {/* Section 4: About you */}
          <div>
            <h2 className="text-xl font-bold text-ink mb-6 pb-3 border-b border-bg-elevated">
              About You
            </h2>
            <div className="space-y-5">
              <div>
                <FieldLabel required>Years of boosting / competitive experience</FieldLabel>
                <input
                  {...register('years_experience', {
                    required: 'Required',
                    min: { value: 0, message: 'Must be 0 or more' },
                  })}
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="e.g. 2"
                  className="input-base w-40"
                />
                {errors.years_experience && <p className="text-danger text-xs mt-1">{errors.years_experience.message}</p>}
              </div>

              <div>
                <FieldLabel>Discord Tag (optional but recommended)</FieldLabel>
                <input
                  {...register('discord_tag')}
                  placeholder="username#0000"
                  className="input-base w-full"
                />
              </div>

              <div>
                <FieldLabel required>
                  Why do you want to join our team? What sets you apart?
                </FieldLabel>
                <p className="text-xs text-ink-muted mb-2">
                  Tell us about your champion pool, ranked history, and what makes you reliable.
                  Minimum 80 characters.
                </p>
                <textarea
                  {...register('motivation', {
                    required: 'Required',
                    minLength: { value: 80, message: 'At least 80 characters' },
                  })}
                  rows={5}
                  placeholder="I've been playing at Diamond+ for 3 seasons. My main pool is Zed/Fizz/Akali mid. I'm known for…"
                  className="input-base w-full resize-none"
                />
                <div className="flex justify-between mt-1">
                  {errors.motivation
                    ? <p className="text-danger text-xs">{errors.motivation.message}</p>
                    : <span />
                  }
                  <p className="text-xs text-ink-muted">{watch('motivation')?.length ?? 0} chars</p>
                </div>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="card p-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <Controller
                name="agreed_terms"
                control={control}
                rules={{ validate: v => v || 'You must accept the terms' }}
                render={({ field }) => (
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={e => field.onChange(e.target.checked)}
                    className="h-4 w-4 mt-0.5 accent-brand"
                  />
                )}
              />
              <span className="text-sm text-ink-secondary leading-relaxed">
                I confirm I own the account(s) I'll be using for demonstration, I'm at least 18
                years old, and I agree to the{' '}
                <Link to="/terms" className="text-brand hover:underline">Terms of Service</Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-brand hover:underline">Privacy Policy</Link>.
              </span>
            </label>
            {errors.agreed_terms && (
              <p className="text-danger text-xs mt-2 ml-7">{errors.agreed_terms.message}</p>
            )}
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/25 rounded-xl p-4 text-danger text-sm">
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="xl"
            loading={submitting}
            className="w-full"
          >
            Submit Application <ArrowRight className="h-5 w-5" />
          </Button>

          <p className="text-center text-xs text-ink-muted">
            Already a customer?{' '}
            <Link to="/login" className="text-brand hover:underline">Sign in first</Link>
            {' '}to link your application to your account.
          </p>
        </form>
      </div>
    </div>
  )
}
