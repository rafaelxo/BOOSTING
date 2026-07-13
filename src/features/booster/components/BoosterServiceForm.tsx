import { useState } from 'react'
import { EMPTY_SERVICE_FORM, type ServiceFormData } from '@/features/booster/utils/boosterServiceForm'

const SERVICE_TYPES = [
  { value: 'boosting',       label: 'Boosting'          },
  { value: 'coaching',       label: 'Coaching'          },
  { value: 'duo',            label: 'Duo'               },
  { value: 'match_analysis', label: 'Análise de partida' },
  { value: 'other',          label: 'Outro'             },
]

const UNITS = [
  { value: 'fixed',        label: 'Valor fechado'   },
  { value: 'per_hour',     label: 'Por hora'        },
  { value: 'per_division', label: 'Por divisão'     },
  { value: 'per_match',    label: 'Por partida'     },
]

export function BoosterServiceForm({
  initial = EMPTY_SERVICE_FORM,
  onSave,
  onCancel,
  saving,
}: {
  initial?: ServiceFormData
  onSave: (data: ServiceFormData) => void
  onCancel: () => void
  saving: boolean
}) {
  const [data, setData] = useState<ServiceFormData>(initial)

  function field(k: keyof ServiceFormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setData(d => ({ ...d, [k]: e.target.value }))
  }

  const valid = data.title.trim().length > 0 && parseFloat(data.price) > 0

  return (
    <div className="card border-brand/30 p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Categoria</label>
          <select value={data.service_type} onChange={field('service_type')} className="input-base w-full text-sm">
            {SERVICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Unidade de cobrança</label>
          <select value={data.unit} onChange={field('unit')} className="input-base w-full text-sm">
            {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
      </div>

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
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Duração / prazo estimado</label>
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

      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Requisitos (opcional)</label>
        <textarea
          value={data.requirements}
          onChange={field('requirements')}
          maxLength={300}
          rows={2}
          placeholder="Ex: cliente precisa fornecer acesso à conta com autenticador desativado"
          className="input-base w-full text-sm resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Disponibilidade (opcional)</label>
        <input
          value={data.availability_note}
          onChange={field('availability_note')}
          maxLength={120}
          placeholder="Ex: Somente à noite (após 20h)"
          className="input-base w-full text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Regras (opcional)</label>
        <textarea
          value={data.rules}
          onChange={field('rules')}
          maxLength={300}
          rows={2}
          placeholder="Ex: reembolso não se aplica após início do serviço"
          className="input-base w-full text-sm resize-none"
        />
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
