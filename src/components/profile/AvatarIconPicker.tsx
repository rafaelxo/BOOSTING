import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { fetchRiotProfileIconIds, parseRiotProfileIconId, riotProfileIconUrl } from '@/lib/riotAssets'

interface AvatarIconPickerProps {
  currentUrl: string | null | undefined
  onSelect: (url: string) => void | Promise<void>
  maxIcons?: number
  gridClassName?: string
}

// Shared League of Legends profile-icon picker used by every "meu perfil"
// surface (drawer panel + full profile pages for all roles) so the Riot asset
// fetch/selection logic lives in exactly one place.
export function AvatarIconPicker({ currentUrl, onSelect, maxIcons = 240, gridClassName }: AvatarIconPickerProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectedId(parseRiotProfileIconId(currentUrl))
  }, [currentUrl])

  const { data: iconIds = [] } = useQuery({
    queryKey: ['riot-profile-icons'],
    queryFn: fetchRiotProfileIconIds,
    staleTime: 1000 * 60 * 60,
  })

  async function handleSelect(id: number) {
    setSelectedId(id)
    setSaving(true)
    await onSelect(riotProfileIconUrl(id))
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Ícone de Perfil</p>
        {saving && <span className="text-[10px] text-ink-muted">Salvando...</span>}
      </div>
      <p className="text-[11px] text-ink-secondary">Ícones oficiais do League of Legends.</p>
      {iconIds.length > 0 ? (
        <div className={cn('grid grid-cols-6 gap-1.5 max-h-64 overflow-y-auto pr-0.5', gridClassName)}>
          {iconIds.slice(0, maxIcons).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => handleSelect(id)}
              className={cn(
                'aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-110 focus:outline-none',
                selectedId === id ? 'border-brand shadow-sm' : 'border-transparent',
              )}
            >
              <img
                src={riotProfileIconUrl(id)}
                alt={`Ícone ${id}`}
                className="w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-1.5">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-bg-elevated animate-pulse" />
          ))}
        </div>
      )}
    </div>
  )
}
