import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { normalizeApiError, assertRpcSuccess } from '@/api/core/errors'

export interface BoosterPanelFields {
  display_name: string | null
  full_name: string | null
  cpf: string | null
}

export async function getBoosterPanelFields(userId: string): Promise<BoosterPanelFields | null> {
  const { data, error } = await supabase
    .from('booster_profiles')
    .select('display_name, full_name, cpf')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw normalizeApiError(error)
  return data
}

export async function updateMyUsername(username: string) {
  const { data, error } = await supabase.rpc('update_my_username', { p_username: username })
  if (error) throw normalizeApiError(error)
  return assertRpcSuccess(data as { success: boolean; error?: string }, {
    username_taken: 'Este nome de usuário já está em uso.',
  })
}

export async function updateMyAvatar(params: { userId: string; avatarUrl: string }) {
  const { error } = await supabase.from('profiles').update({ avatar_url: params.avatarUrl }).eq('id', params.userId)
  if (error) throw normalizeApiError(error, 'Não foi possível atualizar o avatar.')
}

export async function updateBoosterDisplayName(params: { userId: string; displayName: string }) {
  const { error } = await supabase.from('booster_profiles').update({ display_name: params.displayName }).eq('user_id', params.userId)
  if (error) throw normalizeApiError(error, 'Não foi possível atualizar o nome de exibição.')
}

export async function updateBoosterFullName(params: { userId: string; fullName: string | null }) {
  const { error } = await supabase.from('booster_profiles').update({ full_name: params.fullName }).eq('user_id', params.userId)
  if (error) throw normalizeApiError(error, 'Não foi possível atualizar o nome completo.')
}

export async function updateBoosterCpf(params: { userId: string; cpf: string }) {
  const { error } = await supabase.from('booster_profiles').update({ cpf: params.cpf }).eq('user_id', params.userId)
  if (error) throw normalizeApiError(error, 'Não foi possível atualizar o CPF.')
}

export function useBoosterPanelFields(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['auth', 'booster-panel-fields', userId ?? ''],
    queryFn: () => getBoosterPanelFields(userId!),
    enabled: !!userId && enabled,
  })
}

export function useUpdateMyUsername() {
  return useMutation({ mutationFn: updateMyUsername })
}

export function useUpdateMyAvatar() {
  return useMutation({ mutationFn: updateMyAvatar })
}

export function useBoosterPanelMutations(userId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['auth', 'booster-panel-fields', userId ?? ''] })
  return {
    updateDisplayName: useMutation({ mutationFn: updateBoosterDisplayName, onSuccess: invalidate }),
    updateFullName: useMutation({ mutationFn: updateBoosterFullName, onSuccess: invalidate }),
    updateCpf: useMutation({ mutationFn: updateBoosterCpf, onSuccess: invalidate }),
  }
}
