import { JIKAN, mapTmdbResults, tmdb, type CatalogResult, type TmdbSearchItem } from './catalog'
import type { WatchlistItem } from './types'

export interface Recommendation {
  result: CatalogResult
  score: number
  because: string[]
}

const keyOf = (r: { source: string; media_type: string; external_id: string }) =>
  `${r.source}:${r.media_type}:${r.external_id}`

// Onthouden zolang de app open is, zodat terugkeren naar de pagina niet alles opnieuw ophaalt
let cache: { signature: string; list: Recommendation[] } | null = null

// Aanbevelingen op basis van je best beoordeelde titels. Hoe vaker een titel terugkomt
// (en hoe hoger je de bron beoordeelde), hoe hoger hij in de lijst staat.
export async function loadRecommendations(items: WatchlistItem[]): Promise<Recommendation[]> {
  const seeds = items
    .filter((i) => i.rating !== null && i.rating >= 7)
    .sort((a, b) => b.rating! - a.rating! || b.updated_at.localeCompare(a.updated_at))
  const tmdbSeeds = seeds.filter((i) => i.source === 'tmdb').slice(0, 8)
  const animeSeeds = seeds.filter((i) => i.source === 'jikan').slice(0, 4)

  const signature = [...tmdbSeeds, ...animeSeeds].map((i) => `${i.id}:${i.rating}`).join(',') + `|${items.length}`
  if (cache?.signature === signature) return cache.list

  const owned = new Set(items.map(keyOf))
  const found = new Map<string, Recommendation>()
  function add(result: CatalogResult, weight: number, seed: WatchlistItem) {
    const key = keyOf(result)
    if (owned.has(key)) return
    const existing = found.get(key) ?? { result, score: 0, because: [] }
    existing.score += weight * (seed.rating! / 10)
    if (!existing.because.includes(seed.title)) existing.because.push(seed.title)
    found.set(key, existing)
  }

  await Promise.all(
    tmdbSeeds.map(async (seed) => {
      const data = await tmdb<{ results: TmdbSearchItem[] }>(`${seed.media_type}/${seed.external_id}/recommendations`).catch(
        () => ({ results: [] }),
      )
      // Aanbevelingen bevatten niet altijd een media_type; dat is dan hetzelfde als de bron
      const results = mapTmdbResults(data.results.map((r) => ({ ...r, media_type: r.media_type ?? seed.media_type })))
      results.slice(0, 15).forEach((r, index) => add(r, 15 - index, seed))
    }),
  )

  // Jikan staat maar een paar verzoeken per seconde toe, dus één voor één
  for (const seed of animeSeeds) {
    const res = await fetch(`${JIKAN}/anime/${seed.external_id}/recommendations`).catch(() => null)
    if (res?.ok) {
      const data: { data: { entry: JikanEntry }[] } = await res.json()
      data.data.slice(0, 15).forEach(({ entry }, index) => add(jikanEntryToResult(entry), 15 - index, seed))
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }

  const list = [...found.values()].sort((a, b) => b.score - a.score).slice(0, 40)
  cache = { signature, list }
  return list
}

interface JikanEntry {
  mal_id: number
  title: string
  images: { webp?: { large_image_url?: string }; jpg?: { large_image_url?: string; image_url?: string } }
}

function jikanEntryToResult(entry: JikanEntry): CatalogResult {
  return {
    source: 'jikan',
    media_type: 'anime',
    external_id: String(entry.mal_id),
    title: entry.title,
    original_title: null,
    year: null,
    poster_url: entry.images.webp?.large_image_url ?? entry.images.jpg?.large_image_url ?? entry.images.jpg?.image_url ?? null,
    overview: null,
    total_episodes: null,
    subtype: null,
  }
}
