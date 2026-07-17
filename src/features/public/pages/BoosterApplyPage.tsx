import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { LogoMark, PageLoader, ThemeToggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { BoosterApplicationForm } from '@/features/booster/components/BoosterApplicationForm'
import { useBoosterStatus } from '@/features/booster/hooks/useBoosterStatus'
import { PendingScreen, RejectedScreen, BoosterStatusErrorScreen } from '@/features/booster/components/BoosterStatusScreens'

export function BoosterApplyPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profile } = useAuthStore()
  const isBoosterIntent = searchParams.get('booster') === '1'
  const isAlreadyBooster = profile?.role === 'booster'
  const { state } = useBoosterStatus()

  if (!isBoosterIntent) return <Navigate to="/" replace />
  if (!profile) return null
  if (profile.role !== 'customer' && !isAlreadyBooster) return <Navigate to="/" replace />
  if (isAlreadyBooster && state === 'approved') return <Navigate to="/booster" replace />

  async function startBoosterApplication() {
    if (!profile) return false
    if (profile.role === 'booster') return true

    // Compatibility RPC: it no longer promotes the user to booster. It only
    // verifies the user can start an application; the role is changed by admin
    // approval in the database.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.rpc('request_booster_role') as any
    const result = data as { success?: boolean } | null
    if (error || !result?.success) return false

    return true
  }

  async function handleApplicationSaved() {
    await queryClient.invalidateQueries({ queryKey: ['booster-profile-access-status', profile?.id] })
    navigate('/apply?booster=1', { replace: true })
  }

  const header = (
    <div className="flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2">
        <LogoMark className="h-9 w-9" />
        <span className="text-xl font-bold text-ink">
          Elo<span className="text-brand">Peak</span>
        </span>
      </Link>
      <ThemeToggle />
    </div>
  )

  // Role já é 'booster' — a fonte de verdade sobre o que mostrar em /apply passa
  // a ser o status real da candidatura (evita depender só do role, que já foi
  // trocado antes de onboard_booster criar a linha em booster_profiles). Se não
  // houver candidatura (falha parcial após a troca de role), o formulário abaixo
  // funciona como rota de recuperação.
  if (isAlreadyBooster && state !== 'no_application') {
    return (
      <div className="min-h-screen bg-bg-base px-4 py-10 flex flex-col">
        <div className="mx-auto w-full max-w-lg space-y-8">{header}</div>
        <div className="flex-1 flex items-center justify-center">
          {state === 'loading' && <PageLoader />}
          {state === 'pending' && <PendingScreen />}
          {state === 'rejected' && <RejectedScreen />}
          {state === 'error' && <BoosterStatusErrorScreen />}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-base px-4 py-10">
      <div className="mx-auto w-full max-w-lg space-y-8">
        {header}

        <div>
          <p className="section-label mb-3">Candidatura</p>
          <h1 className="text-3xl font-bold text-ink">Candidatar-se como booster</h1>
          <p className="text-sm text-ink-secondary mt-2">
            Preencha os dados abaixo. A mesma candidatura será analisada pela equipe antes da liberação dos pedidos.
          </p>
        </div>

        <BoosterApplicationForm
          submitLabel="Enviar Candidatura"
          onEnsureBoosterRole={startBoosterApplication}
          onSuccess={handleApplicationSaved}
        />
      </div>
    </div>
  )
}
