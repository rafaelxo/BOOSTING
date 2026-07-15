import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Check } from 'lucide-react'
import { Skeleton, RankBadge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { RANK_TIER_LABEL } from '@/lib/utils'
import type { ServiceExtra, MasterPlusPricing, BoostFlow } from '@/types'

const FLOW_GROUPS: { flow: BoostFlow; label: string; hint: string }[] = [
  { flow: 'solo_standard', label: 'Solo Boost (Iron–Diamond)', hint: 'Percentual aplicado sobre o preço base do pedido.' },
  { flow: 'duo_standard', label: 'Duo Boost (Iron–Diamond)', hint: 'Percentual aplicado sobre o preço base do pedido.' },
  { flow: 'master_plus', label: 'Boost Master+', hint: 'Percentual aplicado sobre o preço vindo da tabela abaixo.' },
]

const MASTER_PLUS_TIERS: MasterPlusPricing['tier'][] = ['master', 'grandmaster', 'challenger']

function useBoostAddonsAdmin() {
  return useQuery({
    queryKey: ['admin-boost-addons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_extras')
        .select('*')
        .not('flow', 'is', null)
        .order('flow')
        .order('sort_order')
      if (error) throw error
      return data as ServiceExtra[]
    },
  })
}

function AddonRow({ extra }: { extra: ServiceExtra }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(extra.name)
  const [description, setDescription] = useState(extra.description)
  const [pct, setPct] = useState(String(extra.price_modifier_pct))
  const [saved, setSaved] = useState(false)

  const dirty = name !== extra.name || description !== extra.description || pct !== String(extra.price_modifier_pct)

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('service_extras')
        .update({ name: name.trim(), description: description.trim(), price_modifier_pct: Number(pct) || 0 })
        .eq('id', extra.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-boost-addons'] })
      queryClient.invalidateQueries({ queryKey: ['boost-addons'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const toggleActive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('service_extras').update({ is_active: !extra.is_active }).eq('id', extra.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-boost-addons'] })
      queryClient.invalidateQueries({ queryKey: ['boost-addons'] })
    },
  })

  return (
    <tr className="border-b border-bg-elevated last:border-0">
      <td className="py-2.5 pr-3">
        <code className="text-[10px] font-mono text-ink-muted bg-bg-elevated px-1.5 py-0.5 rounded">{extra.code}</code>
      </td>
      <td className="py-2.5 pr-3">
        <input value={name} onChange={(e) => setName(e.target.value)} className="input-base w-full text-sm" maxLength={60} />
      </td>
      <td className="py-2.5 pr-3">
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="input-base w-full text-sm" maxLength={300} />
      </td>
      <td className="py-2.5 pr-3 w-24">
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            className="input-base w-16 text-sm text-right"
          />
          <span className="text-xs text-ink-muted">%</span>
        </div>
      </td>
      <td className="py-2.5 pr-3">
        <button
          onClick={() => toggleActive.mutate()}
          className={`badge text-xs ${extra.is_active ? 'text-success bg-success/10' : 'text-ink-muted bg-bg-overlay'}`}
        >
          {extra.is_active ? 'Ativo' : 'Inativo'}
        </button>
      </td>
      <td className="py-2.5 text-right w-20">
        {dirty ? (
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="text-xs font-bold text-brand hover:underline disabled:opacity-40"
          >
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        ) : saved ? (
          <span className="flex items-center justify-end gap-1 text-xs text-success"><Check className="h-3 w-3" /> Salvo</span>
        ) : null}
      </td>
    </tr>
  )
}

function MasterPlusPricingGrid() {
  const queryClient = useQueryClient()
  const { data: rows, isLoading } = useQuery({
    queryKey: ['admin-master-plus-pricing'],
    queryFn: async () => {
      const { data, error } = await supabase.from('master_plus_pricing').select('*')
      if (error) throw error
      return data as MasterPlusPricing[]
    },
  })

  if (isLoading) return <Skeleton className="h-32 w-full" />

  return (
    <div className="space-y-2">
      {MASTER_PLUS_TIERS.map((tier) => {
        const row = rows?.find(r => r.tier === tier)
        return (
          <div key={tier} className="flex items-center justify-between gap-3 rounded-xl border border-bg-elevated p-3">
            <div className="flex items-center gap-3">
              <RankBadge tier={tier} size="xs" showLabel={false} />
              <span className="font-semibold text-ink">{RANK_TIER_LABEL[tier]}</span>
            </div>
            {row ? (
              <PriceCell
                row={row}
                onSaved={() => queryClient.invalidateQueries({ queryKey: ['admin-master-plus-pricing'] })}
              />
            ) : (
              <span className="text-xs text-ink-muted">—</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PriceCell({ row, onSaved }: { row: MasterPlusPricing; onSaved: () => void }) {
  const [value, setValue] = useState(row.price != null ? String(row.price) : '')
  const [saved, setSaved] = useState(false)

  useEffect(() => { setValue(row.price != null ? String(row.price) : '') }, [row.price])

  const save = useMutation({
    mutationFn: async () => {
      const price = value.trim() === '' ? null : Number(value)
      const { error } = await supabase.from('master_plus_pricing').update({ price }).eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => {
      onSaved()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const dirty = value !== (row.price != null ? String(row.price) : '')

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-ink-muted">R$</span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => dirty && save.mutate()}
        placeholder="—"
        className={`input-base w-24 text-sm text-center ${row.price == null && !dirty ? 'border-warning/40' : ''}`}
      />
      {saved && <Check className="h-3.5 w-3.5 text-success shrink-0" />}
    </div>
  )
}

export function AdminBoostConfigPage() {
  const { data: addons, isLoading } = useBoostAddonsAdmin()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">Configuração de Boost</h1>
        <p className="text-sm text-ink-secondary mt-1">
          Addons e preços do configurador de Solo Boost, Duo Boost e Boost Master+.
        </p>
      </div>

      {/* Addons por fluxo */}
      <div className="space-y-6">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          FLOW_GROUPS.map(({ flow, label, hint }) => {
            const rows = addons?.filter(a => a.flow === flow) ?? []
            return (
              <div key={flow} className="card p-5">
                <h2 className="text-sm font-bold text-ink mb-0.5">{label}</h2>
                <p className="text-xs text-ink-muted mb-4">{hint}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-bg-elevated">
                        <th className="py-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Código</th>
                        <th className="py-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Nome</th>
                        <th className="py-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Descrição</th>
                        <th className="py-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Percentual</th>
                        <th className="py-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Status</th>
                        <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-ink-muted"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((extra) => <AddonRow key={extra.id} extra={extra} />)}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-ink-muted mt-3">
                  A ordem de exibição (Acesso Prioritário sempre por último) é travada pelo sistema e não é editável aqui.
                </p>
              </div>
            )
          })
        )}
      </div>

      {/* Master+ pricing */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-0.5">
          <Sparkles className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-bold text-ink">Tabela de Preços — Boost Master+</h2>
        </div>
        <p className="text-xs text-ink-muted mb-4">
          Preço fixo por tier alvo, independente de qual tier o cliente parte ou da faixa de PDL atual. Tier com preço
          vazio (—) bloqueia a criação de pedidos até ser preenchido — o sistema nunca cobra um valor não configurado aqui.
        </p>
        <MasterPlusPricingGrid />
      </div>
    </div>
  )
}
