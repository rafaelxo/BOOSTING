import { useState, useEffect, KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { LANES } from '@/lib/lolTaxonomy'
import type { RankTier } from '@/types'

const DAYS = [
  { key: 'mon', label: 'Seg' },
  { key: 'tue', label: 'Ter' },
  { key: 'wed', label: 'Qua' },
  { key: 'thu', label: 'Qui' },
  { key: 'fri', label: 'Sex' },
  { key: 'sat', label: 'Sáb' },
  { key: 'sun', label: 'Dom' },
]

// Mesmo critério aceito na candidatura (BoosterApplicationForm) — mantém o
// rank de pico exibido publicamente consistente com o que foi validado.
const PEAK_OPTIONS = [
  { value: 'grandmaster', label: 'Grão-mestre' },
  { value: 'challenger',  label: 'Desafiante'  },
] as const

const MAX_SPECIALTIES = 8

interface ProfessionalProfileData {
  display_name: string
  bio: string | null
  lanes: string[] | null
  specialties: string[] | null
  peak_rank: { tier: RankTier; division: string | null } | null
  opgg_link: string | null
  available_days: string[] | null
  hours_per_day_min: number | null
  hours_per_day_max: number | null
  can_coach: boolean | null
}

export function BoosterProfessionalProfileForm({ userId }: { userId: string }) {
  const qc = useQueryClient()

  const [displayName, setDisplayName]       = useState('')
  const [bio, setBio]                       = useState('')
  const [lanes, setLanes]                   = useState<string[]>([])
  const [specialties, setSpecialties]       = useState<string[]>([])
  const [specialtyInput, setSpecialtyInput] = useState('')
  const [peakTier, setPeakTier]             = useState<string | null>(null)
  const [opggLink, setOpggLink]             = useState('')
  const [availableDays, setAvailableDays]   = useState<string[]>([])
  const [hoursMin, setHoursMin]             = useState('')
  const [hoursMax, setHoursMax]             = useState('')
  const [canCoach, setCanCoach]             = useState<boolean | null>(null)
  const [saving, setSaving]                 = useState(false)
  const [saved, setSaved]                   = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['booster-professional-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_profiles')
        .select('display_name, bio, lanes, specialties, peak_rank, opgg_link, available_days, hours_per_day_min, hours_per_day_max, can_coach')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data as unknown as ProfessionalProfileData | null
    },
    enabled: !!userId,
  })

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.display_name ?? '')
    setBio(profile.bio ?? '')
    setLanes(profile.lanes ?? [])
    setSpecialties(profile.specialties ?? [])
    setPeakTier(profile.peak_rank?.tier ?? null)
    setOpggLink(profile.opgg_link ?? '')
    setAvailableDays(profile.available_days ?? [])
    setHoursMin(profile.hours_per_day_min != null ? String(profile.hours_per_day_min) : '')
    setHoursMax(profile.hours_per_day_max != null ? String(profile.hours_per_day_max) : '')
    setCanCoach(profile.can_coach)
  }, [profile])

  function toggleLane(key: string) {
    setLanes(prev => (prev.includes(key) ? prev.filter(l => l !== key) : prev.length < 2 ? [...prev, key] : prev))
  }

  function toggleDay(key: string) {
    setAvailableDays(prev => (prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key]))
  }

  function addSpecialty() {
    const s = specialtyInput.trim().slice(0, 30)
    if (!s || specialties.includes(s) || specialties.length >= MAX_SPECIALTIES) return
    setSpecialties(prev => [...prev, s])
    setSpecialtyInput('')
  }

  function handleSpecialtyKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); addSpecialty() }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('booster_profiles')
      .update({
        display_name: displayName.trim() || undefined,
        bio: bio.trim() || null,
        lanes,
        specialties,
        peak_rank: peakTier ? { tier: peakTier, division: null } : null,
        opgg_link: opggLink.trim() || null,
        available_days: availableDays,
        hours_per_day_min: hoursMin ? Number(hoursMin) : null,
        hours_per_day_max: hoursMax ? Number(hoursMax) : null,
        can_coach: canCoach,
      })
      .eq('user_id', userId)
    setSaving(false)
    if (error) { setError('Erro ao salvar. Tente novamente.'); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    qc.invalidateQueries({ queryKey: ['booster-professional-profile', userId] })
    qc.invalidateQueries({ queryKey: ['public-booster-profile'] })
  }

  if (isLoading) {
    return (
      <div className="card p-6 space-y-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  const isComplete = !!(displayName.trim() && bio.trim() && lanes.length && peakTier)

  return (
    <div className="card p-6 space-y-6">
      <div>
        <h2 className="text-sm font-bold text-ink">Perfil Profissional</h2>
        <p className="text-xs text-ink-muted mt-0.5">Visível para clientes ao acessar seu perfil público.</p>
        {!isComplete && (
          <p className="text-xs text-warning mt-2">Complete suas informações profissionais para aparecer para os clientes.</p>
        )}
      </div>

      {/* Nome de exibição */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Nome de exibição</label>
        <input
          value={displayName}
          onChange={e => setDisplayName(e.target.value.slice(0, 32))}
          maxLength={32}
          placeholder="Nome público"
          className="input-base w-full text-sm"
        />
      </div>

      {/* Bio */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Apresentação / Bio</label>
          <span className="text-[10px] text-ink-muted">{bio.length}/256</span>
        </div>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value.slice(0, 256))}
          rows={3}
          placeholder="Conte sobre sua experiência, estilo de jogo e o que te diferencia..."
          className="input-base w-full text-sm resize-none"
        />
      </div>

      {/* Rank de pico */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Rank de Pico</label>
        <div className="grid grid-cols-2 gap-3 max-w-xs">
          {PEAK_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeakTier(value)}
              className={cn(
                'py-2.5 px-4 rounded-xl border-2 text-sm font-bold transition-all',
                peakTier === value
                  ? 'bg-brand/15 border-brand text-brand'
                  : 'border-bg-elevated text-ink-secondary hover:border-brand/40 hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lanes */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
          Lanes Masterizadas <span className="normal-case font-normal">(máx. 2)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {LANES.map(({ key, label }) => {
            const selected = lanes.includes(key)
            const disabled = !selected && lanes.length >= 2
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleLane(key)}
                disabled={disabled}
                className={cn(
                  'px-3.5 py-1.5 rounded-xl text-xs font-bold border-2 transition-all',
                  selected
                    ? 'bg-brand/15 border-brand text-brand'
                    : disabled
                    ? 'border-bg-elevated text-ink-muted opacity-40 cursor-not-allowed'
                    : 'border-bg-elevated text-ink-secondary hover:border-brand/40 hover:text-ink',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Specialties */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
          Especialidades <span className="normal-case font-normal">({specialties.length}/{MAX_SPECIALTIES})</span>
        </label>
        {specialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {specialties.map(s => (
              <span key={s} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-bg-elevated text-xs font-medium text-ink-secondary">
                {s}
                <button type="button" onClick={() => setSpecialties(prev => prev.filter(x => x !== s))} className="hover:text-danger transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {specialties.length < MAX_SPECIALTIES && (
          <div className="flex gap-2">
            <input
              value={specialtyInput}
              onChange={e => setSpecialtyInput(e.target.value.slice(0, 30))}
              onKeyDown={handleSpecialtyKey}
              placeholder="Ex: Farmador, Teamfighter, Macro..."
              className="input-base flex-1 text-sm"
            />
            <button
              type="button"
              onClick={addSpecialty}
              disabled={!specialtyInput.trim()}
              className="px-3 py-2 rounded-xl bg-bg-elevated text-ink-secondary hover:text-ink hover:bg-bg-overlay disabled:opacity-40 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* OP.GG */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Link do OP.GG (opcional)</label>
        <input
          value={opggLink}
          onChange={e => setOpggLink(e.target.value)}
          placeholder="https://op.gg/summoners/br/SeuNome"
          className="input-base w-full text-sm"
        />
      </div>

      {/* Disponibilidade de horários */}
      <div className="space-y-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Disponibilidade</label>
        <div className="flex gap-1.5 flex-wrap">
          {DAYS.map(({ key, label }) => {
            const selected = availableDays.includes(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                className={cn(
                  'px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all',
                  selected
                    ? 'bg-brand/15 border-brand text-brand'
                    : 'border-bg-elevated text-ink-secondary hover:border-brand/40 hover:text-ink',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-xs">
          <div className="space-y-1.5">
            <label className="text-xs text-ink-muted">Horas mín. / dia</label>
            <input type="number" min={1} max={24} value={hoursMin} onChange={e => setHoursMin(e.target.value)} className="input-base w-full text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-ink-muted">Horas máx. / dia</label>
            <input type="number" min={1} max={24} value={hoursMax} onChange={e => setHoursMax(e.target.value)} className="input-base w-full text-sm" />
          </div>
        </div>
      </div>

      {/* Coaching */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Tipo de serviço</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: false, label: 'Apenas Boost',     desc: 'Somente elo boost'         },
            { value: true,  label: 'Boost + Coaching', desc: 'Aceito pedidos de coaching' },
          ].map(({ value, label, desc }) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setCanCoach(value)}
              className={cn(
                'py-3 px-4 rounded-xl border-2 text-left transition-all',
                canCoach === value ? 'bg-brand/15 border-brand' : 'border-bg-elevated hover:border-brand/40',
              )}
            >
              <p className={cn('text-sm font-bold', canCoach === value ? 'text-brand' : 'text-ink')}>{label}</p>
              <p className="text-xs text-ink-muted mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center justify-end gap-3 pt-1">
        {saved && <span className="text-xs text-success">Perfil salvo!</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brand/90 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </div>
    </div>
  )
}
