import { animeTitles, englishTitle, mapTmdbResults, parseJikanDuration, tmdb, type CatalogResult, type TmdbSearchItem } from './catalog'
import { jikan } from './jikan'
import type { WatchlistItem } from './types'

export interface FranchiseEntry {
  result: CatalogResult
  // null voor de hoofdreeks; anders bijv. "Zijverhaal"
  relation: string | null
}

export interface Franchise {
  name: string
  entries: FranchiseEntry[]
}

// Kijkvolgorde van een filmreeks (TMDB-collectie) of anime-reeks (MyAnimeList-relaties)
export async function loadFranchise(item: Pick<WatchlistItem, 'source' | 'media_type' | 'external_id'>): Promise<Franchise | null> {
  if (item.source === 'tmdb') return item.media_type === 'movie' ? movieCollection(item.external_id) : null
  const key = `franchise:${item.external_id}`
  const cached = readCache(key)
  if (cached !== undefined) return cached
  const result = await animeFranchise(Number(item.external_id))
  writeCache(key, result)
  return result
}

async function movieCollection(id: string): Promise<Franchise | null> {
  const movie = await tmdb<{ belongs_to_collection: { id: number; name: string } | null }>(`movie/${id}`)
  if (!movie.belongs_to_collection) return null
  const collection = await tmdb<{ name: string; parts: TmdbSearchItem[] }>(`collection/${movie.belongs_to_collection.id}`)
  const parts = collection.parts
    .map((p) => ({ ...p, media_type: 'movie' }))
    // Op volgorde van uitkomen; aangekondigde films zonder datum achteraan
    .sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'))
  if (parts.length < 2) return null
  return { name: collection.name, entries: mapTmdbResults(parts).map((result) => ({ result, relation: null })) }
}

interface Relation {
  relation: string
  entry: { mal_id: number; type: string; name: string }[]
}

interface JikanFull {
  mal_id: number
  title: string
  title_english: string | null
  titles?: { type: string; title: string }[]
  type: string | null
  episodes: number | null
  duration: string | null
  year: number | null
  aired?: { from: string | null }
  synopsis: string | null
  images: { webp?: { large_image_url?: string }; jpg?: { large_image_url?: string; image_url?: string } }
  relations: Relation[]
}

const SIDE_RELATIONS: Record<string, string> = {
  'Side Story': 'Zijverhaal',
  'Spin-Off': 'Spin-off',
  'Alternative Version': 'Andere versie',
  Summary: 'Samenvatting',
}

const MAX_REQUESTS = 25

async function animeFranchise(startId: number): Promise<Franchise | null> {
  const nodes = new Map<number, JikanFull>()
  const get = async (id: number) => {
    if (!nodes.has(id)) {
      if (nodes.size >= MAX_REQUESTS) throw new Error('Reeks te lang')
      nodes.set(id, (await jikan<{ data: JikanFull }>(`anime/${id}/full`)).data)
    }
    return nodes.get(id)!
  }
  const related = (node: JikanFull, relation: string) =>
    node.relations.find((r) => r.relation === relation)?.entry.find((e) => e.type === 'anime')?.mal_id ?? null

  let start = await get(startId)
  // Een losse film of zijverhaal: dan de reeks van het hoofdverhaal tonen
  if (!related(start, 'Prequel') && !related(start, 'Sequel')) {
    const parent = related(start, 'Parent Story') ?? related(start, 'Full Story')
    if (parent) start = await get(parent)
  }

  const chain: JikanFull[] = []
  try {
    // Terug naar het begin, dan vooruit langs alle vervolgen
    let first = start
    const visited = new Set([start.mal_id])
    for (let prev = related(first, 'Prequel'); prev && !visited.has(prev); prev = related(first, 'Prequel')) {
      visited.add(prev)
      first = await get(prev)
    }
    chain.push(first)
    for (let next = related(first, 'Sequel'); next && !chain.some((n) => n.mal_id === next); next = related(chain.at(-1)!, 'Sequel')) {
      chain.push(await get(next))
    }
  } catch {
    // Heel lange reeksen: tonen wat we hebben
    if (chain.length === 0) chain.push(start)
  }

  const entries: FranchiseEntry[] = []
  const listed = new Set(chain.map((n) => n.mal_id))
  for (const node of chain) {
    entries.push({ result: fullToResult(node), relation: null })
    for (const rel of node.relations) {
      const label = SIDE_RELATIONS[rel.relation]
      if (!label) continue
      for (const e of rel.entry) {
        if (e.type !== 'anime' || listed.has(e.mal_id)) continue
        listed.add(e.mal_id)
        const known = nodes.get(e.mal_id)
        entries.push({ result: known ? fullToResult(known) : minimalResult(e.mal_id, e.name), relation: label })
      }
    }
  }
  // De titel zelf hoort er altijd bij, ook als hij buiten de hoofdlijn valt
  if (!listed.has(startId)) entries.push({ result: fullToResult(nodes.get(startId)!), relation: 'Gerelateerd' })
  if (entries.length < 2) return null
  return { name: chain[0].title_english || chain[0].title, entries }
}

function fullToResult(a: JikanFull): CatalogResult {
  return {
    source: 'jikan',
    media_type: 'anime',
    external_id: String(a.mal_id),
    ...animeTitles(a.title, englishTitle(a)),
    year: a.year ?? (a.aired?.from ? Number(a.aired.from.slice(0, 4)) : null),
    poster_url: a.images.webp?.large_image_url ?? a.images.jpg?.large_image_url ?? a.images.jpg?.image_url ?? null,
    overview: a.synopsis,
    total_episodes: a.episodes,
    subtype: a.type,
    runtime: parseJikanDuration(a.duration),
  }
}

// Bij toevoegen haalt de app de ontbrekende gegevens alsnog op
export function minimalResult(id: number, title: string, poster: string | null = null): CatalogResult {
  return {
    source: 'jikan',
    media_type: 'anime',
    external_id: String(id),
    title,
    original_title: null,
    year: null,
    poster_url: poster,
    overview: null,
    total_episodes: null,
    subtype: null,
  }
}

// Reeksen veranderen zelden: een week onthouden scheelt veel verzoeken aan MyAnimeList
const WEEK = 7 * 24 * 60 * 60 * 1000

function readCache(key: string): Franchise | null | undefined {
  try {
    const entry = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (entry && Date.now() - entry.at < WEEK) return entry.value
  } catch {
    // opnieuw ophalen
  }
  return undefined
}

function writeCache(key: string, value: Franchise | null) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }))
  } catch {
    // niet erg
  }
}
