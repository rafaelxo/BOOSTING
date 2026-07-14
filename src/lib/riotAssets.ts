const RIOT_GAME_DATA_BASE =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1'

export const RIOT_PROFILE_ICONS_INDEX_URL = `${RIOT_GAME_DATA_BASE}/profile-icons.json`

interface RiotProfileIcon {
  id: number | string
}

export function riotProfileIconUrl(id: number): string {
  return `${RIOT_GAME_DATA_BASE}/profile-icons/${id}.jpg`
}

export function parseRiotProfileIconId(url: string | null | undefined): number | null {
  const match = url?.match(/(?:profile-icons|profileicon)\/(\d+)\.(?:jpg|png|webp)/i)
  if (!match) return null

  const id = Number(match[1])
  return Number.isFinite(id) ? id : null
}

export async function fetchRiotProfileIconIds(): Promise<number[]> {
  const response = await fetch(RIOT_PROFILE_ICONS_INDEX_URL)
  if (!response.ok) {
    throw new Error('Não foi possível carregar os ícones de perfil do League of Legends.')
  }

  const icons = (await response.json()) as RiotProfileIcon[]

  return icons
    .map(icon => Number(icon.id))
    .filter(id => Number.isFinite(id))
    .sort((a, b) => a - b)
}
