import { supabase } from './supabase'

interface ProfileIconsResponse {
  version: string
  icons: { id: number; url: string }[]
  stale: boolean
}

let iconUrlById: Map<number, string> = new Map()

export function riotProfileIconUrl(id: number): string {
  return iconUrlById.get(id) ?? `https://ddragon.leagueoflegends.com/cdn/img/profileicon/${id}.png`
}

export function parseRiotProfileIconId(url: string | null | undefined): number | null {
  const match = url?.match(/profileicon\/(\d+)\.(?:png|jpg|webp)/i)
  if (!match) return null
  const id = Number(match[1])
  return Number.isFinite(id) ? id : null
}

export async function fetchRiotProfileIconIds(): Promise<number[]> {
  // Internal proxy (supabase/functions/riot-profile-icons) fetches Data Dragon
  // server-side — the browser never talks to ddragon.leagueoflegends.com or
  // any third-party asset host directly for this call. `method: 'GET'` is
  // required here: supabase-js's functions.invoke() defaults to POST, but
  // this endpoint is a read-only, cacheable GET.
  const { data, error } = await supabase.functions.invoke<ProfileIconsResponse>('riot-profile-icons', {
    method: 'GET',
  })
  if (error || !data) {
    throw new Error('Não foi possível carregar os ícones de perfil do League of Legends.')
  }
  iconUrlById = new Map(data.icons.map((icon) => [icon.id, icon.url]))
  return data.icons.map((icon) => icon.id)
}
