import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Package } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { checkRateLimit, limits } from '@/lib/rateLimit'
import type { BoosterService } from '@/types'
import { BoosterServiceForm } from './BoosterServiceForm'
import { BoosterServiceCard } from './BoosterServiceCard'
import { EMPTY_SERVICE_FORM, serviceToForm, type ServiceFormData } from '@/features/booster/utils/boosterServiceForm'

const MAX_SERVICES = 5

export function BoosterServicesList({ userId }: { userId: string }) {
  const qc = useQueryClient()

  const [adding, setAdding]               = useState(false)
  const [savingNew, setSavingNew]         = useState(false)
  const [editingId, setEditingId]         = useState<string | null>(null)
  const [savingEdit, setSavingEdit]       = useState(false)
  const [deletingId, setDeletingId]       = useState<string | null>(null)
  const [togglingId, setTogglingId]       = useState<string | null>(null)

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['booster-services', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_services')
        .select('*')
        .eq('booster_id', userId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as BoosterService[]
    },
    enabled: !!userId,
  })

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['booster-services', userId] })
  }

  async function handleCreate(form: ServiceFormData) {
    if (!checkRateLimit(`svc-create-${userId}`, limits.rpcMutation)) return
    setSavingNew(true)
    const { error } = await supabase.from('booster_services').insert({
      booster_id: userId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      service_type: form.service_type,
      unit: form.unit,
      tempo: form.tempo.trim() || null,
      price: parseFloat(form.price),
      requirements: form.requirements.trim() || null,
      availability_note: form.availability_note.trim() || null,
      rules: form.rules.trim() || null,
    })
    setSavingNew(false)
    if (!error) { setAdding(false); invalidate() }
  }

  async function handleUpdate(id: string, form: ServiceFormData) {
    setSavingEdit(true)
    const { error } = await supabase.from('booster_services').update({
      title: form.title.trim(),
      description: form.description.trim() || null,
      service_type: form.service_type,
      unit: form.unit,
      tempo: form.tempo.trim() || null,
      price: parseFloat(form.price),
      requirements: form.requirements.trim() || null,
      availability_note: form.availability_note.trim() || null,
      rules: form.rules.trim() || null,
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

  async function handleToggleActive(service: BoosterService) {
    setTogglingId(service.id)
    await supabase.from('booster_services').update({ is_active: !service.is_active }).eq('id', service.id)
    setTogglingId(null)
    invalidate()
  }

  const canAdd = services.length < MAX_SERVICES

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-ink">Serviços Oferecidos</h2>
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
        <BoosterServiceForm
          initial={EMPTY_SERVICE_FORM}
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
            <p className="font-semibold text-ink text-sm">Você ainda não cadastrou nenhum serviço.</p>
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
              <BoosterServiceForm
                key={service.id}
                initial={serviceToForm(service)}
                onSave={form => handleUpdate(service.id, form)}
                onCancel={() => setEditingId(null)}
                saving={savingEdit}
              />
            ) : (
              <BoosterServiceCard
                key={service.id}
                service={service}
                onEdit={() => { setEditingId(service.id); setAdding(false) }}
                onDelete={() => handleDelete(service.id)}
                onToggleActive={() => handleToggleActive(service)}
                deleting={deletingId === service.id}
                togglingActive={togglingId === service.id}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}
