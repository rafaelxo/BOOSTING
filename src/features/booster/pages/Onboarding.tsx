import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BoosterApplicationForm } from '../components/BoosterApplicationForm'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function BoosterOnboardingPage() {
  const { profile } = useAuthStore()

  const { data: boosterProfile, isLoading } = useQuery({
    queryKey: ['booster-profile-onboarding-status', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('booster_profiles')
        .select('status')
        .eq('user_id', profile!.id)
        .maybeSingle()
      return data
    },
    enabled: !!profile?.id,
  })

  if (isLoading) return null
  if (boosterProfile?.status === 'approved') return <Navigate to="/booster" replace />

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Completar Cadastro</h1>
        <p className="text-sm text-ink-secondary mt-1">
          Bem-vindo à EloPeak. Preencha os dados abaixo para ativar sua conta de booster.
        </p>
      </div>

      <BoosterApplicationForm />
    </div>
  )
}
