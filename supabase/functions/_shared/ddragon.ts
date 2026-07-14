import { fetchWithTimeout } from './http.ts'

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com'
const CACHE_TTL_MS = Number(Deno.env.get('DDRAGON_CACHE_TTL_MS') ?? String(6 * 60 * 60 * 1000)) // 6h default

interface CacheEntry {
  fetchedAt: number
  version: string
  icons: { id: number; url: string }[]
}

let cache: CacheEntry | null = null
let inFlight: Promise<CacheEntry> | null = null

async function fetchFresh(): Promise<CacheEntry> {
  const versionsResp = await fetchWithTimeout(`${DDRAGON_BASE}/api/versions.json`, {}, 8000)
  if (!versionsResp.ok) throw new Error(`versions.json failed: ${versionsResp.status}`)
  const versions = await versionsResp.json() as unknown
  if (!Array.isArray(versions) || typeof versions[0] !== 'string') {
    throw new Error('versions.json returned an unexpected shape')
  }
  const version = versions[0] as string

  const iconsResp = await fetchWithTimeout(
    `${DDRAGON_BASE}/cdn/${version}/data/pt_BR/profileicon.json`, {}, 8000,
  )
  if (!iconsResp.ok) throw new Error(`profileicon.json failed: ${iconsResp.status}`)
  const body = await iconsResp.json() as { data?: Record<string, { id: number }> }
  if (!body.data || typeof body.data !== 'object') {
    throw new Error('profileicon.json returned an unexpected shape')
  }

  const icons = Object.values(body.data)
    .map((entry) => ({ id: entry.id, url: `${DDRAGON_BASE}/cdn/${version}/img/profileicon/${entry.id}.png` }))
    .sort((a, b) => a.id - b.id)

  if (icons.length === 0) throw new Error('profileicon.json returned zero icons')

  return { fetchedAt: Date.now(), version, icons }
}

// Cache + concurrent-call collapsing: multiple simultaneous requests while
// the cache is cold/stale share a single upstream fetch instead of firing
// one Data Dragon request per caller. Falls back to the last-known-good
// cache entry (even if stale) on any upstream failure, rather than erroring
// every caller whenever Data Dragon has a blip.
export async function getProfileIcons(): Promise<{ version: string; icons: { id: number; url: string }[]; stale: boolean }> {
  const isFresh = cache && (Date.now() - cache.fetchedAt) < CACHE_TTL_MS
  if (isFresh) return { version: cache!.version, icons: cache!.icons, stale: false }

  if (!inFlight) {
    inFlight = fetchFresh()
      .then((fresh) => { cache = fresh; return fresh })
      .catch((err) => {
        if (cache) {
          console.error('Data Dragon fetch failed, serving stale cache', err instanceof Error ? err.message : err)
          return cache
        }
        throw err
      })
      .finally(() => { inFlight = null })
  }

  const result = await inFlight
  return { version: result.version, icons: result.icons, stale: result !== cache || (Date.now() - result.fetchedAt) >= CACHE_TTL_MS }
}
