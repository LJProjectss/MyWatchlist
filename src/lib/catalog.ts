import type { MediaType, NextAir, SeasonInfo, Source } from './types'

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
  runtime?: number | null
}

const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w342'
export const JIKAN = 'https://api.jikan.moe/v4'

export async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`/api/tmdb/${path}?${new URLSearchParams(params)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? body?.status_message ?? `TMDB gaf foutcode ${res.status}`)
  }
  return res.json()
}

export interface TmdbSearchItem {
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
  return mapTmdbResults(data.results)
}

export function mapTmdbResults(results: TmdbSearchItem[]): CatalogResult[] {
  return results
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
  duration?: string | null
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
        runtime: parseJikanDuration(a.duration),
      }
    })
}

// Extra gegevens die niet in de zoekresultaten zitten, zoals de IMDb-ID en het aantal afleveringen.
export async function fetchExtraDetails(result: CatalogResult) {
  if (result.source === 'jikan') {
    let episodes = result.total_episodes
    let runtime = result.runtime ?? null
    // Aanbevelingen van Jikan bevatten geen aantal afleveringen of speelduur; dan halen we die los op
    if (episodes === null || runtime === null) {
      const res = await fetch(`${JIKAN}/anime/${result.external_id}`)
      if (res.ok) {
        const data = (await res.json()).data
        episodes = data?.episodes ?? episodes
        runtime = parseJikanDuration(data?.duration) ?? runtime
      }
    }
    return { imdb_id: null, total_episodes: episodes, seasons: animeSeasons(episodes), runtime }
  }
  if (result.media_type === 'movie') {
    const movie = await tmdb<{ imdb_id: string | null; runtime: number | null }>(`movie/${result.external_id}`)
    return { imdb_id: movie.imdb_id, total_episodes: null, seasons: null, runtime: movie.runtime || null }
  }
  const tv = await fetchTmdbShow(result.external_id)
  return { imdb_id: tv.imdb_id, total_episodes: totalEpisodes(tv.seasons), seasons: tv.seasons, runtime: tv.runtime }
}

interface TmdbShow {
  external_ids?: { imdb_id: string | null }
  seasons?: { season_number: number; name: string; episode_count: number }[]
  status?: string
  next_episode_to_air?: { season_number: number; episode_number: number; air_date: string | null; runtime?: number | null } | null
  last_episode_to_air?: { runtime?: number | null } | null
  episode_run_time?: number[]
}

export async function fetchTmdbShow(id: string) {
  const tv = await tmdb<TmdbShow>(`tv/${id}`, { append_to_response: 'external_ids' })
  // Seizoen 0 bevat specials; die laten we buiten de voortgang
  const seasons: SeasonInfo[] = (tv.seasons ?? [])
    .filter((s) => s.season_number > 0 && s.episode_count > 0)
    .map((s) => ({ season_number: s.season_number, name: s.name, episode_count: s.episode_count }))
  const next = tv.next_episode_to_air
  const next_air: NextAir | null = next
    ? { season_number: next.season_number, episode_number: next.episode_number, air_date: next.air_date }
    : null
  // Speelduur per aflevering: TMDB vult episode_run_time niet altijd meer, dan de laatste aflevering
  const runtime = tv.episode_run_time?.[0] || tv.last_episode_to_air?.runtime || next?.runtime || null
  return { imdb_id: tv.external_ids?.imdb_id ?? null, seasons, next_air, show_status: tv.status ?? null, runtime }
}

export function animeSeasons(episodes: number | null): SeasonInfo[] | null {
  return episodes ? [{ season_number: 1, name: 'Afleveringen', episode_count: episodes }] : null
}

export function totalEpisodes(seasons: SeasonInfo[] | null) {
  return seasons ? seasons.reduce((sum, s) => sum + s.episode_count, 0) : null
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

// "24 min per ep", "1 hr 50 min" of "45 sec" naar minuten
export function parseJikanDuration(duration: string | null | undefined) {
  if (!duration) return null
  const hours = Number(duration.match(/(\d+)\s*hr/)?.[1] ?? 0)
  const minutes = Number(duration.match(/(\d+)\s*min/)?.[1] ?? 0)
  const total = hours * 60 + minutes
  return total > 0 ? total : null
}
