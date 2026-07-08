import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Plus } from 'lucide-react'
import { Button, EmptyState, Skeleton, Modal } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { supabase } from '@/lib/supabase'
import type { Service, ServiceType } from '@/types'

const SERVICE_TYPES: ServiceType[] = ['elo_boost', 'win_boost', 'coaching', 'placement_matches', 'md5']

interface ServiceForm {
  game_id: string
  type: ServiceType | ''
  name: string
  description: string
  short_description: string
  is_active: boolean
  sort_order: string
}

function serviceToForm(s: Service): ServiceForm {
  return {
    game_id: s.game_id,
    type: s.type,
    name: s.name,
    description: s.description ?? '',
    short_description: s.short_description ?? '',
    is_active: s.is_active,
    sort_order: String(s.sort_order),
  }
}

const EMPTY_FORM: ServiceForm = {
  game_id: '', type: '', name: '', description: '', short_description: '', is_active: true, sort_order: '0',
}

export function AdminServicesPage() {
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; service?: Service } | null>(null)
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM)

  const { data: services, isLoading } = useQuery({
    queryKey: ['admin-services'],
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('*').order('sort_order')
      if (error) throw error
      return data as Service[]
    },
  })

  const { data: games } = useQuery({
    queryKey: ['admin-games'],
    queryFn: async () => {
      const { data, error } = await supabase.from('games').select('id, name').order('sort_order')
      if (error) throw error
      return data as { id: string; name: string }[]
    },
  })

  useEffect(() => {
    if (!modal) return
    setForm(modal.mode === 'edit' && modal.service ? serviceToForm(modal.service) : EMPTY_FORM)
  }, [modal])

  const save = useMutation({
    mutationFn: async () => {
      if (!form.type) throw new Error('Selecione o tipo de serviço')
      if (!form.game_id) throw new Error('Selecione o jogo')
      if (!form.name.trim()) throw new Error('Nome é obrigatório')

      const payload = {
        game_id: form.game_id,
        type: form.type,
        name: form.name.trim(),
        description: form.description.trim() || null,
        short_description: form.short_description.trim() || null,
        is_active: form.is_active,
        sort_order: parseInt(form.sort_order) || 0,
      }

      const { error } = modal?.mode === 'edit' && modal.service
        ? await supabase.from('services').update(payload).eq('id', modal.service.id)
        : await supabase.from('services').insert(payload)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] })
      setModal(null)
    },
  })

  const toggleActive = useMutation({
    mutationFn: async (s: Service) => {
      const { error } = await supabase.from('services').update({ is_active: !s.is_active }).eq('id', s.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-services'] }),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Serviços & Catálogo</h1>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({ mode: 'create' })}>
          Adicionar Serviço
        </Button>
      </div>
      <div className="card p-0">
        {isLoading ? <div className="p-4"><Skeleton className="h-48 w-full" /></div> :
          !services?.length ? <EmptyState icon={Settings} title="Nenhum serviço configurado" description="Adicione serviços para habilitar pedidos." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ordem</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-ink">{s.name}</TableCell>
                  <TableCell className="text-xs font-mono capitalize">{s.type.replace(/_/g, ' ')}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleActive.mutate(s)}
                      className={`badge text-xs ${s.is_active ? 'text-success bg-success/10' : 'text-ink-muted bg-bg-overlay'}`}
                    >
                      {s.is_active ? 'Ativo' : 'Inativo'}
                    </button>
                  </TableCell>
                  <TableCell>{s.sort_order}</TableCell>
                  <TableCell>
                    <Button size="xs" variant="ghost" onClick={() => setModal({ mode: 'edit', service: s })}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Modal
        open={!!modal}
        onOpenChange={(open) => !open && setModal(null)}
        title={modal?.mode === 'edit' ? 'Editar Serviço' : 'Adicionar Serviço'}
        description="O preço é calculado por fórmula (shared/pricing.ts) — este cadastro controla apenas nome, descrição e disponibilidade no catálogo."
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Jogo</label>
              <select
                value={form.game_id}
                onChange={(e) => setForm((f) => ({ ...f, game_id: e.target.value }))}
                disabled={modal?.mode === 'edit'}
                className="input-base w-full text-sm"
              >
                <option value="">Selecione…</option>
                {games?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ServiceType }))}
                disabled={modal?.mode === 'edit'}
                className="input-base w-full text-sm"
              >
                <option value="">Selecione…</option>
                {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Nome</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="input-base w-full text-sm"
              placeholder="Ex: Solo Boost"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Descrição curta</label>
            <input
              value={form.short_description}
              onChange={(e) => setForm((f) => ({ ...f, short_description: e.target.value }))}
              className="input-base w-full text-sm"
              maxLength={140}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Descrição</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="input-base w-full text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Ordem</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                className="input-base w-full text-sm"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="h-4 w-4"
              />
              Ativo no catálogo
            </label>
          </div>

          {save.isError && <p className="text-xs text-danger">{(save.error as Error).message}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>Salvar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
