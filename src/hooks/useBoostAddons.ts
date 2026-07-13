import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { BoostFlow, ServiceExtra } from '@/types'

// Catálogo de addons de um fluxo do configurador de boost (Solo/Duo padrão
// ou Master+), já ordenado por sort_order — Acesso Prioritário sempre por
// último. Usado por qualquer tela que precise listar/exibir os addons de um
// pedido (configurador, resumo, sidebar) para não duplicar a query nem
// arriscar uma ordenação diferente em cada lugar.
export function useBoostAddons(flow: BoostFlow | null) {
  return useQuery({
    queryKey: ['boost-addons', flow],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_extras')
        .select('*')
        .eq('flow', flow as string)
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as ServiceExtra[]
    },
    enabled: !!flow,
    staleTime: 1000 * 60 * 10,
  })
}
