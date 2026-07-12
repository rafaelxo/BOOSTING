import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { ThemeToggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { BoosterApplicationForm } from '@/features/booster/components/BoosterApplicationForm'

export function BoosterApplyPage() {
  const [searchParams] = useSearchParams()
  const { profile, setProfile } = useAuthStore()
  const isBoosterIntent = searchParams.get('booster') === '1'

  if (!isBoosterIntent) return <Navigate to="/" replace />
  if (!profile) return null
  if (profile.role === 'booster') return <Navigate to="/booster" replace />
  if (profile.role !== 'customer') return <Navigate to="/" replace />

  async function ensureBoosterRole() {
    if (!profile) return false
    if (profile.role === 'booster') return true

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.rpc('request_booster_role') as any
    const result = data as { success?: boolean } | null
    if (error || !result?.success) return false

    setProfile({ ...profile, role: 'booster' })
    return true
  }

  return (
    <div className="min-h-screen bg-bg-base px-4 py-10">
      <div className="mx-auto w-full max-w-lg space-y-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-brand">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-ink">
              Elo<span className="text-brand">Peak</span>
            </span>
          </Link>
          <ThemeToggle />
        </div>

        <div>
          <p className="section-label mb-3">Candidatura</p>
          <h1 className="text-3xl font-bold text-ink">Candidatar-se como booster</h1>
          <p className="text-sm text-ink-secondary mt-2">
            Preencha os dados abaixo. A mesma candidatura será analisada pela equipe antes da liberação dos pedidos.
          </p>
        </div>

        <BoosterApplicationForm
          submitLabel="Enviar Candidatura"
          onEnsureBoosterRole={ensureBoosterRole}
        />
      </div>
    </div>
  )
}
