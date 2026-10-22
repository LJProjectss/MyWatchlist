import type { MediaType, Source } from './types'

// Zoekresultaat uit TMDB of Jikan, in één vorm zodat de UI het verschil niet hoeft te kennen.
export interface CatalogResult {
  source: Source
  media_type: MediaType
  external_id: string
  title: string
  original_title: string | null
  year: number | null
  poster_url: string | null
  overview: string | null
  total_episodes: number | null
  subtype: string | null
}

const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w342'
const JIKAN = 'https://api.jikan.moe/v4'

export async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`/api/tmdb/${path}?${new URLSearchParams(params)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? body?.status_message ?? `TMDB gaf foutcode ${res.status}`)
  }
  return res.json()
}

interface TmdbSearchItem {
  id: number
  media_type: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  release_date?: string
  first_air_date?: string
  poster_path: string | null
  overview?: string
}

export async function searchTmdb(query: string): Promise<CatalogResult[]> {
  const data = await tmdb<{ results: TmdbSearchItem[] }>('search/multi', { query, include_adult: 'false' })
  return data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => {
      const title = r.title ?? r.name ?? ''
      const original = r.original_title ?? r.original_name ?? null
      return {
        source: 'tmdb',
        media_type: r.media_type as 'movie' | 'tv',
        external_id: String(r.id),
        title,
        original_title: original && original !== title ? original : null,
        year: parseYear(r.release_date ?? r.first_air_date),
        poster_url: r.poster_path ? TMDB_IMAGE + r.poster_path : null,
        overview: r.overview || null,
        total_episodes: null,
        subtype: null,
      }
    })
}

interface JikanAnime {
  mal_id: number
  title: string
  title_english: string | null
  type: string | null
  episodes: number | null
  year: number | null
  aired?: { from: string | null }
  synopsis: string | null
  images: { webp?: { large_image_url?: string }; jpg?: { large_image_url?: string; image_url?: string } }
}

export async function searchJikan(query: string): Promise<CatalogResult[]> {
  const res = await fetch(`${JIKAN}/anime?${new URLSearchParams({ q: query, limit: '20', sfw: 'true' })}`)
  if (res.status === 429) throw new Error('MyAnimeList is even te druk. Probeer het over een paar seconden opnieuw.')
  if (!res.ok) throw new Error(`Jikan gaf foutcode ${res.status}`)
  const data: { data: JikanAnime[] } = await res.json()

  // Jikan geeft soms dubbele resultaten terug
  const seen = new Set<number>()
  return data.data
    .filter((a) => !seen.has(a.mal_id) && seen.add(a.mal_id))
    .map((a) => {
      const title = a.title_english || a.title
      return {
        source: 'jikan',
        media_type: 'anime',
        external_id: String(a.mal_id),
        title,
        original_title: title !== a.title ? a.title : null,
        year: a.year ?? parseYear(a.aired?.from),
        poster_url: a.images.webp?.large_image_url ?? a.images.jpg?.large_image_url ?? a.images.jpg?.image_url ?? null,
        overview: a.synopsis,
        total_episodes: a.episodes,
        subtype: a.type,
      }
    })
}

// Extra gegevens die niet in de zoekresultaten zitten, zoals de IMDb-ID en het aantal afleveringen.
export async function fetchExtraDetails(result: CatalogResult) {
  if (result.source !== 'tmdb') return { imdb_id: null, total_episodes: result.total_episodes }
  if (result.media_type === 'movie') {
    const movie = await tmdb<{ imdb_id: string | null }>(`movie/${result.external_id}`)
    return { imdb_id: movie.imdb_id, total_episodes: null }
  }
  const tv = await tmdb<{ number_of_episodes: number | null; external_ids?: { imdb_id: string | null } }>(
    `tv/${result.external_id}`,
    { append_to_response: 'external_ids' },
  )
  return { imdb_id: tv.external_ids?.imdb_id ?? null, total_episodes: tv.number_of_episodes }
}

export function externalLinks(item: { source: Source; media_type: MediaType; external_id: string; imdb_id: string | null }) {
  const links: { label: string; href: string }[] = []
  if (item.imdb_id) links.push({ label: 'IMDb', href: `https://www.imdb.com/title/${item.imdb_id}/` })
  if (item.source === 'tmdb') links.push({ label: 'TMDB', href: `https://www.themoviedb.org/${item.media_type}/${item.external_id}` })
  if (item.source === 'jikan') links.push({ label: 'MyAnimeList', href: `https://myanimelist.net/anime/${item.external_id}` })
  return links
}

function parseYear(date: string | null | undefined) {
  const year = date ? Number(date.slice(0, 4)) : NaN
  return Number.isFinite(year) ? year : null
}
