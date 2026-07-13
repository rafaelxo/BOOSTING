import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Landmark, Eye, EyeOff, Copy, Check } from 'lucide-react'
import { Card, EmptyState, Skeleton, RankBadge, Button } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { RANK_TIER_LABEL } from '@/lib/utils'
import type { DuoAccount } from '@/types'

type RevealState = { login: string; password: string } | 'loading' | 'error'
type BoosterVisibleDuoAccount = Pick<DuoAccount, 'id' | 'label' | 'current_rank' | 'is_active'>

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-ink-muted hover:text-ink transition-colors"
      aria-label="Copiar"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

export function BoosterAccountsPage() {
  const [revealed, setRevealed] = useState<Record<string, RevealState>>({})

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['booster-duo-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('duo_accounts')
        .select('id, label, current_rank, is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as BoosterVisibleDuoAccount[]
    },
  })

  async function toggleReveal(a: BoosterVisibleDuoAccount) {
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
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Contas Duo Boost</h1>
        <p className="text-sm text-ink-secondary mt-1">
          Contas da empresa disponíveis para você usar em pedidos de Duo Boost. Ao revelar,
          use apenas para o serviço em andamento e não compartilhe as credenciais.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
      ) : !accounts?.length ? (
        <EmptyState icon={Landmark} title="Nenhuma conta disponível no momento" description="Fale com a equipe se precisar de uma conta duo para um pedido." />
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => {
            const rev = revealed[a.id]
            const isOpen = rev && rev !== 'loading' && rev !== 'error'
            return (
              <Card key={a.id} padding="md">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {a.current_rank && (
                      <RankBadge tier={a.current_rank.tier} division={a.current_rank.division} size="sm" showLabel={false} />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{a.label}</p>
                      {a.current_rank && (
                        <p className="text-xs text-ink-muted">
                          {RANK_TIER_LABEL[a.current_rank.tier]}{a.current_rank.division ? ` ${a.current_rank.division}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => toggleReveal(a)} loading={rev === 'loading'}>
                    {isOpen ? <><EyeOff className="h-3.5 w-3.5 mr-1.5" />Ocultar</> : <><Eye className="h-3.5 w-3.5 mr-1.5" />Revelar</>}
                  </Button>
                </div>

                {rev === 'error' && (
                  <p className="text-xs text-danger mt-3">Não foi possível revelar as credenciais. Tente novamente.</p>
                )}

                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-bg-elevated grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1">Login</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono text-ink truncate">{rev.login}</p>
                        <CopyButton value={rev.login} />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1">Senha</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono text-ink truncate">{rev.password}</p>
                        <CopyButton value={rev.password} />
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
