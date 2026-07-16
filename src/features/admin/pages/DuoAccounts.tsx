import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Landmark, Plus, Eye, EyeOff, Search, CheckCircle2 } from 'lucide-react'
import { Button, EmptyState, Skeleton, Modal, RankBadge, ErrorAlert } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { supabase } from '@/lib/supabase'
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction'
import { RANK_TIER_LABEL, formatDate } from '@/lib/utils'
import type { DuoAccount, Division, RankTier } from '@/types'
import type { Database } from '@/lib/database.types'

const RIOT_ID_FORMAT = /^[^#]{1,16}#[A-Za-z0-9]{2,5}$/

type RiotRankResponse = {
  found?: boolean
  ranked?: boolean
  tier?: RankTier
  division?: Division | null
  message?: string
}

const DIVISIONS: Division[] = ['IV', 'III', 'II', 'I']
const DUO_RANK_TIERS: RankTier[] = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond']
type AdminDuoAccount = DuoAccount & { has_credentials?: boolean }

function duoAccountError(code?: string): string {
  const messages: Record<string, string> = {
    unauthorized: 'Somente administradores podem gerenciar contas Duo.',
    invalid_label: 'Informe um identificador válido para a conta.',
    rank_out_of_supported_range: 'Contas Duo devem estar entre Ferro IV e Diamante I.',
    login_and_password_required_together: 'Preencha login e senha juntos.',
    credentials_required: 'Uma conta ativa precisa ter login e senha cadastrados.',
    invalid_credentials: 'Login ou senha inválidos.',
    account_not_found: 'Conta Duo não encontrada.',
    server_key_not_configured: 'A chave de criptografia do servidor não está configurada.',
  }
  return messages[code ?? ''] ?? 'Não foi possível salvar a conta Duo.'
}

interface AccountForm {
  label: string
  riot_id: string
  tier: RankTier
  division: Division
  notes: string
  is_active: boolean
  login: string
  password: string
}

const EMPTY_FORM: AccountForm = {
  label: '', riot_id: '', tier: 'gold', division: 'IV', notes: '', is_active: true, login: '', password: '',
}

function accountToForm(a: AdminDuoAccount): AccountForm {
  return {
    label: a.label,
    riot_id: a.riot_id ?? '',
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
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; account?: AdminDuoAccount } | null>(null)
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM)
  const [revealed, setRevealed] = useState<Record<string, { login: string; password: string } | 'loading' | 'error'>>({})
  const [riotVerified, setRiotVerified] = useState(false)
  const [riotLookupError, setRiotLookupError] = useState<string | null>(null)
  const [riotLookupMessage, setRiotLookupMessage] = useState<string | null>(null)

  const lookupRiot = useMutation({
    mutationFn: async () => {
      const trimmed = form.riot_id.trim()
      if (!RIOT_ID_FORMAT.test(trimmed)) throw new Error('Riot ID inválido. Use o formato Nome#TAG (ex.: Fulano#BR1).')
      return invokeEdgeFunction<RiotRankResponse>('riot-account-rank', {
        body: { riot_id: trimmed, queue: 'solo_duo' },
        requireAuth: true,
      })
    },
    onSuccess: (result) => {
      setRiotLookupError(null)
      if (!result.found) {
        setRiotLookupMessage(null)
        setRiotLookupError('Conta Riot não encontrada.')
        return
      }
      if (result.ranked && result.tier) {
        setForm((f) => ({ ...f, tier: result.tier!, division: result.division ?? 'IV' }))
        setRiotLookupMessage(result.message ?? 'Rank preenchido automaticamente a partir da Riot.')
      } else {
        setRiotLookupMessage('Conta sem rank nesta fila — preencha o rank manualmente abaixo.')
      }
      setRiotVerified(true)
    },
    onError: (err) => {
      setRiotVerified(false)
      setRiotLookupMessage(null)
      setRiotLookupError(err instanceof Error ? err.message : 'Não foi possível consultar a Riot agora.')
    },
  })

  const { data: accounts, isLoading, isError, error: accountsError } = useQuery({
    queryKey: ['admin-duo-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_duo_accounts')
      if (error) throw error
      const result = data as { success?: boolean; accounts?: AdminDuoAccount[]; error?: string } | null
      if (!result?.success) throw new Error(duoAccountError(result?.error))
      return result.accounts ?? []
    },
  })

  useEffect(() => {
    if (!modal) return
    setForm(modal.mode === 'edit' && modal.account ? accountToForm(modal.account) : EMPTY_FORM)
    // Contas já existentes já passaram pela verificação em algum momento —
    // só uma nova conta exige rodar o lookup antes de liberar as credenciais.
    setRiotVerified(modal.mode === 'edit')
    setRiotLookupError(null)
    setRiotLookupMessage(null)
  }, [modal])

  const save = useMutation({
    mutationFn: async () => {
      if (!form.label.trim()) throw new Error('Nome/identificador é obrigatório')
      if (modal?.mode === 'create' && (!form.login.trim() || !form.password.trim())) {
        throw new Error('Login e senha são obrigatórios ao criar uma conta')
      }

      // save_duo_account aceita NULL em p_account_id/p_notes/p_login/p_password
      // (criação vs. edição, campos opcionais) — o tipo gerado pelo Supabase
      // não modela isso para parâmetros escalares de RPC, daí o cast pontual
      // para a assinatura real da função em vez de usar `any`.
      const { data, error } = await supabase.rpc('save_duo_account', {
        p_account_id: modal?.mode === 'edit' ? modal.account?.id ?? null : null,
        p_riot_id: form.riot_id.trim() || null,
        p_label: form.label.trim(),
        p_tier: form.tier,
        p_division: form.division,
        p_notes: form.notes.trim() || null,
        p_is_active: form.is_active,
        p_login: form.login.trim() || null,
        p_password: form.password || null,
      } as Database['public']['Functions']['save_duo_account']['Args'])
      if (error) throw error
      const result = data as { success?: boolean; error?: string } | null
      if (!result?.success) throw new Error(duoAccountError(result?.error))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-duo-accounts'] })
      setModal(null)
    },
  })

  const toggleActive = useMutation({
    mutationFn: async (a: AdminDuoAccount) => {
      const { data, error } = await supabase.rpc('set_duo_account_active', { p_account_id: a.id, p_is_active: !a.is_active })
      if (error) throw error
      const result = data as { success?: boolean; error?: string } | null
      if (!result?.success) throw new Error(duoAccountError(result?.error))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-duo-accounts'] }),
  })

  const releaseReservation = useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await supabase.rpc('admin_release_duo_account', { p_account_id: accountId })
      if (error) throw error
      const result = data as { success?: boolean; error?: string } | null
      if (!result?.success) throw new Error(duoAccountError(result?.error))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-duo-accounts'] }),
  })

  async function toggleReveal(a: AdminDuoAccount) {
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
          isError ? <div className="p-4"><ErrorAlert message={accountsError instanceof Error ? accountsError.message : 'Não foi possível carregar as contas Duo.'} /></div> :
          !accounts?.length ? <EmptyState icon={Landmark} title="Nenhuma conta cadastrada" description="Adicione contas para que boosters possam usá-las em Duo Boost." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead>Credenciais</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reserva</TableHead>
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
                    <TableCell>
                      {a.reserved_by ? (
                        <div className="flex items-center gap-2">
                          <span className="badge text-xs text-warning bg-warning/10">Reservada</span>
                          <Button size="xs" variant="ghost" loading={releaseReservation.isPending} onClick={() => releaseReservation.mutate(a.id)}>
                            Liberar
                          </Button>
                        </div>
                      ) : (
                        <span className="badge text-xs text-ink-muted bg-bg-overlay">Livre</span>
                      )}
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

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Riot ID</label>
            <div className="flex gap-2">
              <input
                value={form.riot_id}
                onChange={(e) => {
                  setForm((f) => ({ ...f, riot_id: e.target.value }))
                  setRiotVerified(false)
                  setRiotLookupMessage(null)
                  setRiotLookupError(null)
                }}
                className="input-base w-full text-sm"
                placeholder="Ex: NomeDaConta#BR1"
                autoComplete="off"
              />
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                loading={lookupRiot.isPending}
                disabled={!form.riot_id.trim()}
                onClick={() => lookupRiot.mutate()}
                leftIcon={<Search className="h-3.5 w-3.5" />}
              >
                Verificar
              </Button>
            </div>
            <p className="text-[10px] text-ink-muted">
              Consulta rank e PDL atuais na Riot antes de liberar login/senha abaixo.
            </p>
            {riotLookupMessage && (
              <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {riotLookupMessage}</p>
            )}
            {riotLookupError && <ErrorAlert message={riotLookupError} />}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Rank atual</label>
              <select
                value={form.tier}
                onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as RankTier }))}
                className="input-base w-full text-sm"
              >
                {DUO_RANK_TIERS.map((t) => <option key={t} value={t}>{RANK_TIER_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Divisão</label>
              <select
                value={form.division}
                onChange={(e) => setForm((f) => ({ ...f, division: e.target.value as Division }))}
                className="input-base w-full text-sm"
              >
                {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {!riotVerified ? (
            <p className="text-xs text-ink-muted rounded-xl border border-bg-elevated bg-bg-elevated/40 px-3 py-2.5">
              Verifique o Riot ID acima para liberar os campos de login e senha.
            </p>
          ) : (
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
          )}

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

          {save.isError && <ErrorAlert message={(save.error as Error).message} />}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>Salvar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
