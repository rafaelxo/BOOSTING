import { useState, useEffect, KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Clock, DollarSign, Package, X } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useCurrency } from '@/hooks/useCurrency'
import { cn } from '@/lib/utils'
import type { BoosterService } from '@/types'
import { checkRateLimit, limits } from '@/lib/rateLimit'

// ── Lane constants ────────────────────────────────────────────────────────────

const LANES = [
  { key: 'top',     label: 'Topo'     },
  { key: 'jungle',  label: 'Selva'    },
  { key: 'mid',     label: 'Meio'     },
  { key: 'bot',     label: 'Atirador' },
  { key: 'support', label: 'Suporte'  },
]

const MAX_SERVICES    = 5
const MAX_SPECIALTIES = 8

// ── Public Profile Section ────────────────────────────────────────────────────

interface PublicProfileData {
  bio: string | null
  lanes: string[] | null
  specialties: string[] | null
}

function PublicProfileSection({ userId }: { userId: string }) {
  const qc = useQueryClient()

  const [bio, setBio]                     = useState('')
  const [lanes, setLanes]                 = useState<string[]>([])
  const [specialties, setSpecialties]     = useState<string[]>([])
  const [specialtyInput, setSpecialtyInput] = useState('')
  const [saving, setSaving]               = useState(false)
  const [saved, setSaved]                 = useState(false)

  const { data: bProfile } = useQuery({
    queryKey: ['booster-public-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_profiles')
        .select('bio, lanes, specialties')
        .eq('user_id', userId)
        .single()
      if (error) throw error
      return data as PublicProfileData
    },
  })

  useEffect(() => {
    if (bProfile) {
      setBio(bProfile.bio ?? '')
      setLanes(bProfile.lanes ?? [])
      setSpecialties(bProfile.specialties ?? [])
    }
  }, [bProfile])

  function toggleLane(key: string) {
    setLanes(prev =>
      prev.includes(key)
        ? prev.filter(l => l !== key)
        : prev.length < 2 ? [...prev, key] : prev,
    )
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
    await supabase
      .from('booster_profiles')
      .update({ bio: bio.trim() || null, lanes, specialties })
      .eq('user_id', userId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    qc.invalidateQueries({ queryKey: ['booster-public-profile', userId] })
  }

  const dirty =
    bio !== (bProfile?.bio ?? '') ||
    JSON.stringify(lanes) !== JSON.stringify(bProfile?.lanes ?? []) ||
    JSON.stringify(specialties) !== JSON.stringify(bProfile?.specialties ?? [])

  return (
    <div className="card p-6 space-y-6">
      <div>
        <h2 className="text-sm font-bold text-ink">Perfil Público</h2>
        <p className="text-xs text-ink-muted mt-0.5">Visível para clientes ao acessar seu perfil.</p>
      </div>

      {/* Bio */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Bio</label>
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

        {/* Tag list */}
        {specialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {specialties.map(s => (
              <span
                key={s}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-bg-elevated text-xs font-medium text-ink-secondary"
              >
                {s}
                <button
                  type="button"
                  onClick={() => setSpecialties(prev => prev.filter(x => x !== s))}
                  className="hover:text-danger transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input */}
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

      {/* Save */}
      <div className="flex items-center justify-end gap-3 pt-1">
        {saved && <span className="text-xs text-success">Perfil salvo!</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brand/90 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </div>
    </div>
  )
}

// ── Service form ──────────────────────────────────────────────────────────────

interface FormData {
  title: string
  description: string
  tempo: string
  price: string
}

const EMPTY: FormData = { title: '', description: '', tempo: '', price: '' }

function serviceToForm(s: BoosterService): FormData {
  return {
    title: s.title,
    description: s.description ?? '',
    tempo: s.tempo ?? '',
    price: String(s.price),
  }
}

function ServiceForm({
  initial = EMPTY,
  onSave,
  onCancel,
  saving,
}: {
  initial?: FormData
  onSave: (data: FormData) => void
  onCancel: () => void
  saving: boolean
}) {
  const [data, setData] = useState<FormData>(initial)

  function field(k: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setData(d => ({ ...d, [k]: e.target.value }))
  }

  const valid = data.title.trim().length > 0 && parseFloat(data.price) > 0

  return (
    <div className="card border-brand/30 p-5 space-y-4">
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Título</label>
        <input
          value={data.title}
          onChange={field('title')}
          maxLength={60}
          placeholder="Ex: Elo Boost Diamante+"
          className="input-base w-full text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Descrição</label>
          <span className="text-[10px] text-ink-muted">{data.description.length}/300</span>
        </div>
        <textarea
          value={data.description}
          onChange={field('description')}
          maxLength={300}
          rows={3}
          placeholder="Descreva o que está incluso..."
          className="input-base w-full text-sm resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Tempo de entrega</label>
          <input
            value={data.tempo}
            onChange={field('tempo')}
            maxLength={50}
            placeholder="Ex: 2-3 dias"
            className="input-base w-full text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Valor (R$)</label>
          <input
            value={data.price}
            onChange={field('price')}
            type="number"
            min="0"
            step="0.01"
            placeholder="0,00"
            className="input-base w-full text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm text-ink-secondary hover:bg-bg-elevated transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={() => onSave(data)}
          disabled={!valid || saving}
          className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brand/90 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

// ── Service card ──────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  onEdit,
  onDelete,
  deleting,
}: {
  service: BoosterService
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const currency = useCurrency()

  return (
    <div className="card p-5 flex flex-col gap-3 h-full">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-ink text-sm leading-snug flex-1">{service.title}</h3>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-bg-elevated transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="p-1.5 rounded-lg text-ink-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {service.description && (
        <p className="text-xs text-ink-secondary leading-relaxed flex-1">{service.description}</p>
      )}

      <div className="flex items-center gap-4 pt-1 border-t border-bg-elevated mt-auto">
        {service.tempo && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-ink-muted shrink-0" />
            <span className="text-xs text-ink-secondary">{service.tempo}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <DollarSign className="h-3.5 w-3.5 text-brand shrink-0" />
          <span className="text-sm font-bold text-brand">{currency(service.price)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function BoosterServicesPage() {
  const { profile } = useAuthStore()
  const qc = useQueryClient()

  const [adding, setAdding]         = useState(false)
  const [savingNew, setSavingNew]   = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['booster-services', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_services')
        .select('*')
        .eq('booster_id', profile!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as BoosterService[]
    },
    enabled: !!profile?.id,
  })

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['booster-services', profile!.id] })
  }

  async function handleCreate(form: FormData) {
    if (!profile) return
    if (!checkRateLimit(`svc-create-${profile.id}`, limits.rpcMutation)) return
    setSavingNew(true)
    const { error } = await supabase.from('booster_services').insert({
      booster_id: profile.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      tempo: form.tempo.trim() || null,
      price: parseFloat(form.price),
    })
    setSavingNew(false)
    if (!error) { setAdding(false); invalidate() }
  }

  async function handleUpdate(id: string, form: FormData) {
    setSavingEdit(true)
    const { error } = await supabase.from('booster_services').update({
      title: form.title.trim(),
      description: form.description.trim() || null,
      tempo: form.tempo.trim() || null,
      price: parseFloat(form.price),
    }).eq('id', id)
    setSavingEdit(false)
    if (!error) { setEditingId(null); invalidate() }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await supabase.from('booster_services').delete().eq('id', id)
    setDeletingId(null)
    invalidate()
  }

  const canAdd = services.length < MAX_SERVICES

  if (!profile) return null

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold text-ink">Meus Serviços</h1>

      {/* ── Perfil Público ── */}
      <PublicProfileSection userId={profile.id} />

      {/* ── Serviços CRUD ── */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-ink">Serviços Oferecidos</h2>
            <p className="text-xs text-ink-secondary mt-0.5">Crie pacotes personalizados para seus clientes.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={cn(
              'text-xs font-bold px-2.5 py-1 rounded-full',
              services.length >= MAX_SERVICES
                ? 'bg-warning/15 text-warning border border-warning/25'
                : 'bg-bg-elevated text-ink-muted',
            )}>
              {services.length}/{MAX_SERVICES}
            </span>
            {canAdd && !adding && (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brand/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            )}
          </div>
        </div>

        {adding && (
          <ServiceForm
            onSave={handleCreate}
            onCancel={() => setAdding(false)}
            saving={savingNew}
          />
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="card p-5 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : services.length === 0 && !adding ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center gap-4">
            <div className="h-10 w-10 rounded-2xl bg-bg-elevated flex items-center justify-center">
              <Package className="h-5 w-5 text-ink-muted" />
            </div>
            <div>
              <p className="font-semibold text-ink text-sm">Nenhum serviço cadastrado</p>
              <p className="text-xs text-ink-muted mt-1">Adicione até {MAX_SERVICES} serviços para oferecer aos clientes.</p>
            </div>
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brand/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Criar primeiro serviço
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {services.map(service =>
              editingId === service.id ? (
                <ServiceForm
                  key={service.id}
                  initial={serviceToForm(service)}
                  onSave={form => handleUpdate(service.id, form)}
                  onCancel={() => setEditingId(null)}
                  saving={savingEdit}
                />
              ) : (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onEdit={() => { setEditingId(service.id); setAdding(false) }}
                  onDelete={() => handleDelete(service.id)}
                  deleting={deletingId === service.id}
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
