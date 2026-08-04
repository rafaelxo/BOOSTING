import { useEffect, useState } from 'react'

const STORAGE_KEY = 'sidebar_collapsed'

// Persistido por localStorage (não por usuário/sessão) -- preferência de UI
// pura, sem valor pra sincronizar entre dispositivos. Compartilhado pelos 3
// painéis com sidebar (cliente/booster/admin); cada um chama o hook com sua
// própria key de storage pra não misturar a preferência entre painéis
// diferentes que o mesmo usuário possa acessar (ex.: admin também logado
// como cliente em outra aba).
export function useSidebarCollapse(scope: string) {
  const storageKey = `${STORAGE_KEY}:${scope}`
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(storageKey) === 'true')

  useEffect(() => {
    localStorage.setItem(storageKey, String(collapsed))
  }, [storageKey, collapsed])

  return { collapsed, toggle: () => setCollapsed((c) => !c) }
}
