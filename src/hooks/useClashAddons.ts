// src/hooks/useClashAddons.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CLASH_ADDON_CODES, sortAddonsBySortOrder } from '@/lib/clashDomain'
import type { ClashFlow, ServiceExtra } from '@/types'

// Mesma referência estável que EMPTY_ADDONS (useBoostAddons.ts) — evita um
// array novo a cada render quando a query está desabilitada (flow null),
// que quebraria qualquer useEffect que dependa dela.
export const EMPTY_CLASH_ADDONS: ServiceExtra[] = []

// Catálogo de addons de um fluxo do Clash (Solo/Duo), já ordenado por
// sort_order. Mesmo padrão de useBoostAddons.ts, mantido separado porque
// ClashFlow não é um BoostFlow (ver shared/clashDomain.ts).
export function useClashAddons(flow: ClashFlow | null) {
  return useQuery({
    queryKey: ['clash-addons', flow],
    queryFn: async () => {
      const addonCodes = [...CLASH_ADDON_CODES[flow!]]
      const { data, error } = await supabase
        .from('service_extras')
        .select('*')
        .eq('flow', flow as string)
        .eq('is_active', true)
        .in('code', addonCodes)
        .order('sort_order')
      if (error) throw error
      return sortAddonsBySortOrder(
        (data as ServiceExtra[]).filter((extra) =>
          extra.flow === flow &&
          typeof extra.code === 'string' &&
          CLASH_ADDON_CODES[flow!].includes(extra.code)
        )
      )
    },
    enabled: !!flow,
    staleTime: 1000 * 60 * 10,
  })
}
