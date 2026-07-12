import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

async function fetchVersion(): Promise<string> {
  const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  const list: string[] = await res.json()
  return list[0]
}

async function fetchIconIds(version: string): Promise<number[]> {
  const res = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/profileicon.json`,
  )
  const json = await res.json()
  return Object.keys(json.data as Record<string, unknown>)
    .map(Number)
    .sort((a, b) => a - b)
}

function iconUrl(version: string, id: number) {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${id}.png`
}

interface AvatarIconPickerProps {
  currentUrl: string | null | undefined
  onSelect: (url: string) => void | Promise<void>
  maxIcons?: number
  gridClassName?: string
}

// Shared League of Legends profile-icon picker used by every "meu perfil"
// surface (drawer panel + full profile pages for all roles) so the DDragon
// fetch/selection logic lives in exactly one place.
export function AvatarIconPicker({ currentUrl, onSelect, maxIcons = 240, gridClassName }: AvatarIconPickerProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (currentUrl) {
      const m = currentUrl.match(/profileicon\/(\d+)\.png/)
      if (m) setSelectedId(parseInt(m[1]))
    }
  }, [currentUrl])

  const { data: version } = useQuery({
    queryKey: ['ddragon-version'],
    queryFn: fetchVersion,
    staleTime: 1000 * 60 * 60,
  })

  const { data: iconIds = [] } = useQuery({
    queryKey: ['ddragon-icons', version],
    queryFn: () => fetchIconIds(version!),
    enabled: !!version,
    staleTime: 1000 * 60 * 60,
  })

  async function handleSelect(id: number) {
    if (!version) return
    setSelectedId(id)
    setSaving(true)
    await onSelect(iconUrl(version, id))
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Ícone de Perfil</p>
        {saving && <span className="text-[10px] text-ink-muted">Salvando...</span>}
      </div>
      <p className="text-[11px] text-ink-secondary">Ícones oficiais do League of Legends.</p>
      {version && iconIds.length > 0 ? (
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
                src={iconUrl(version, id)}
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
