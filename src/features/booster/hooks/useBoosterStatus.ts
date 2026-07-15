import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

type BoosterAccessState =
  | 'loading'
  | 'no_application'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'error'

interface BoosterStatusRow {
  status: string
  display_name: string
}

/**
 * Fonte de verdade única para o status de candidatura de booster do usuário
 * autenticado. Usado tanto pelo painel (/booster/*) quanto por /apply para
 * decidir qual tela mostrar sem duplicar a query em cada lugar.
 */
export function useBoosterStatus() {
  const { profile } = useAuthStore()

  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: ['booster-profile-access-status', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booster_profiles')
        .select('status, display_name')
        .eq('user_id', profile!.id)
        .maybeSingle()
      if (error) throw error
      return data as BoosterStatusRow | null
    },
    enabled: !!profile?.id,
  })

  let state: BoosterAccessState = 'loading'
  if (!profile?.id || isLoading || isFetching) {
    state = 'loading'
  } else if (error) {
    state = 'error'
  } else if (!data) {
    state = 'no_application'
  } else if (data.status === 'pending' || data.status === 'under_review') {
    state = 'pending'
  } else if (data.status === 'approved') {
    state = 'approved'
  } else if (data.status === 'rejected') {
    state = 'rejected'
  } else {
    // status suspenso ou outro valor não mapeado explicitamente na UI — trata como erro
    // para nunca liberar acesso silenciosamente a um estado desconhecido.
    state = 'error'
  }

  return { state, boosterProfile: data ?? null }
}
