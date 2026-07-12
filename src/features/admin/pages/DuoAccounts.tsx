import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Landmark, Plus, Eye, EyeOff } from 'lucide-react'
import { Button, EmptyState, Skeleton, Modal, RankBadge } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { supabase } from '@/lib/supabase'
import { RANK_TIER_ORDER, RANK_TIER_LABEL, formatDate } from '@/lib/utils'
import type { DuoAccount, Division, RankTier } from '@/types'

const DIVISIONS: Division[] = ['IV', 'III', 'II', 'I']
const MASTER_PLUS: RankTier[] = ['master', 'grandmaster', 'challenger']

interface AccountForm {
  label: string
  tier: RankTier
  division: Division
  notes: string
  is_active: boolean
  login: string
  password: string
}

const EMPTY_FORM: AccountForm = {
  label: '', tier: 'gold', division: 'IV', notes: '', is_active: true, login: '', password: '',
}

function accountToForm(a: DuoAccount): AccountForm {
  return {
    label: a.label,
    tier: a.current_rank?.tier ?? 'gold',
    division: a.current_rank?.division ?? 'IV',
    notes: a.notes ?? '',
    is_active: a.is_active,
    login: '',
    password: '',
  }
}

export function AdminDuoAccountsPage() {
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; account?: DuoAccount } | null>(null)
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM)
  const [revealed, setRevealed] = useState<Record<string, { login: string; password: string } | 'loading' | 'error'>>({})

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['admin-duo-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('duo_accounts').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as DuoAccount[]
    },
  })

  useEffect(() => {
    if (!modal) return
    setForm(modal.mode === 'edit' && modal.account ? accountToForm(modal.account) : EMPTY_FORM)
  }, [modal])

  const save = useMutation({
    mutationFn: async () => {
      if (!form.label.trim()) throw new Error('Nome/identificador é obrigatório')
      if (modal?.mode === 'create' && (!form.login.trim() || !form.password.trim())) {
        throw new Error('Login e senha são obrigatórios ao criar uma conta')
      }

      const metaPayload = {
        label: form.label.trim(),
        current_rank: { tier: form.tier, division: MASTER_PLUS.includes(form.tier) ? null : form.division },
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      }

      let accountId = modal?.account?.id

      if (modal?.mode === 'edit' && accountId) {
        const { error } = await supabase.from('duo_accounts').update(metaPayload).eq('id', accountId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('duo_accounts').insert(metaPayload).select('id').single()
        if (error) throw error
        accountId = data.id
      }

      if (form.login.trim() && form.password.trim() && accountId) {
        const { data: result, error } = await supabase.rpc('set_duo_account_credentials', {
          p_account_id: accountId,
          p_login: form.login.trim(),
          p_password: form.password,
        })
        if (error) throw error
        const res = result as { success: boolean; error?: string }
        if (!res.success) throw new Error(res.error ?? 'Falha ao salvar credenciais')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-duo-accounts'] })
      setModal(null)
    },
  })

  const toggleActive = useMutation({
    mutationFn: async (a: DuoAccount) => {
      const { error } = await supabase.from('duo_accounts').update({ is_active: !a.is_active }).eq('id', a.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-duo-accounts'] }),
  })

  async function toggleReveal(a: DuoAccount) {
    if (revealed[a.id] && revealed[a.id] !== 'error') {
      setRevealed((r) => { const next = { ...r }; delete next[a.id]; return next })
      return
    }
    setRevealed((r) => ({ ...r, [a.id]: 'loading' }))
    const { data, error } = await supabase.rpc('get_duo_account_credentials', { p_account_id: a.id })
    const res = data as { success: boolean; login?: string; password?: string } | null
    if (error || !res?.success || !res.login) {
      setRevealed((r) => ({ ...r, [a.id]: 'error' }))
      return
    }
    setRevealed((r) => ({ ...r, [a.id]: { login: res.login!, password: res.password! } }))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Contas Duo Boost</h1>
          <p className="text-sm text-ink-secondary mt-1">Pool de contas smurf da empresa disponibilizadas aos boosters.</p>
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({ mode: 'create' })}>
          Adicionar Conta
        </Button>
      </div>

      <div className="card p-0">
        {isLoading ? <div className="p-4"><Skeleton className="h-48 w-full" /></div> :
          !accounts?.length ? <EmptyState icon={Landmark} title="Nenhuma conta cadastrada" description="Adicione contas para que boosters possam usá-las em Duo Boost." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead>Credenciais</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => {
                const rev = revealed[a.id]
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-ink">{a.label}</TableCell>
                    <TableCell>
                      {a.current_rank ? (
                        <div className="flex items-center gap-2">
                          <RankBadge tier={a.current_rank.tier} division={a.current_rank.division} size="xs" showLabel={false} />
                          <span className="text-xs text-ink-secondary">
                            {RANK_TIER_LABEL[a.current_rank.tier]}{a.current_rank.division ? ` ${a.current_rank.division}` : ''}
                          </span>
                        </div>
                      ) : <span className="text-xs text-ink-muted">—</span>}
                    </TableCell>
                    <TableCell>
                      {rev && rev !== 'loading' && rev !== 'error' ? (
                        <div className="text-xs font-mono text-ink space-y-0.5">
                          <p>{rev.login}</p>
                          <p className="text-ink-muted">{rev.password}</p>
                        </div>
                      ) : rev === 'error' ? (
                        <span className="text-xs text-danger">Falha ao revelar</span>
                      ) : (
                        <span className="text-xs text-ink-muted">••••••••</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleActive.mutate(a)}
                        className={`badge text-xs ${a.is_active ? 'text-success bg-success/10' : 'text-ink-muted bg-bg-overlay'}`}
                      >
                        {a.is_active ? 'Ativa' : 'Inativa'}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-ink-muted">{formatDate(a.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="xs" variant="ghost" onClick={() => toggleReveal(a)} loading={rev === 'loading'}>
                          {rev && rev !== 'loading' && rev !== 'error' ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setModal({ mode: 'edit', account: a })}>
                          Editar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Modal
        open={!!modal}
        onOpenChange={(open) => !open && setModal(null)}
        title={modal?.mode === 'edit' ? 'Editar Conta Duo' : 'Adicionar Conta Duo'}
        description="Login e senha são criptografados no banco e só podem ser revelados por admins e boosters aprovados."
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Identificador</label>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              className="input-base w-full text-sm"
              placeholder="Ex: Conta Duo BR #1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Rank atual</label>
              <select
                value={form.tier}
                onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as RankTier }))}
                className="input-base w-full text-sm"
              >
                {RANK_TIER_ORDER.map((t) => <option key={t} value={t}>{RANK_TIER_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Divisão</label>
              <select
                value={form.division}
                onChange={(e) => setForm((f) => ({ ...f, division: e.target.value as Division }))}
                disabled={MASTER_PLUS.includes(form.tier)}
                className="input-base w-full text-sm disabled:opacity-40"
              >
                {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                Login {modal?.mode === 'edit' && '(deixe em branco p/ manter)'}
              </label>
              <input
                value={form.login}
                onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
                className="input-base w-full text-sm"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                Senha {modal?.mode === 'edit' && '(deixe em branco p/ manter)'}
              </label>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="input-base w-full text-sm"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Notas internas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="input-base w-full text-sm resize-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="h-4 w-4"
            />
            Disponível para boosters
          </label>

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
