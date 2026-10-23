import type { MediaType, NextAir, SeasonInfo, Source } from './types'
import { supabase } from './supabase'
import { jikan } from './jikan'
import { jikanGenres, score, tmdbGenres } from './genres'

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
  // Alleen bekend bij anime uit de zoekresultaten; anders halen we ze op bij het toevoegen
  genres?: string[]
  public_score?: number | null
}

const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w342'
export const JIKAN = 'https://api.jikan.moe/v4'

export async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  // Alleen ingelogde gebruikers mogen via onze site bij TMDB
  const { data } = await supabase.auth.getSession()
  const headers: Record<string, string> = data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
  const res = await fetch(`/api/tmdb/${path}?${new URLSearchParams(params)}`, { headers })
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
  titles?: { type: string; title: string }[]
  type: string | null
  episodes: number | null
  year: number | null
  aired?: { from: string | null }
  synopsis: string | null
  genres?: { name: string }[]
  score?: number | null
  images: { webp?: { large_image_url?: string }; jpg?: { large_image_url?: string; image_url?: string } }
}

export async function searchJikan(query: string): Promise<CatalogResult[]> {
  const res = await fetch(`${JIKAN}/anime?${new URLSearchParams({ q: query, limit: '20', sfw: 'true' })}`)
  if (res.status === 429) throw new Error('MyAnimeList is even te druk. Probeer het over een paar seconden opnieuw.')
  if (!res.ok) throw new Error(`Jikan gaf foutcode ${res.status}`)
  const data: { data: JikanAnime[] } = await res.json()

  return mapJikanResults(data.data)
}

function mapJikanResults(list: JikanAnime[]): CatalogResult[] {
  // Jikan geeft soms dubbele resultaten terug
  const seen = new Set<number>()
  return list
    .filter((a) => !seen.has(a.mal_id) && seen.add(a.mal_id))
    .map((a) => {
      return {
        source: 'jikan',
        media_type: 'anime',
        external_id: String(a.mal_id),
        ...animeTitles(a.title, englishTitle(a)),
        year: a.year ?? parseYear(a.aired?.from),
        poster_url: a.images.webp?.large_image_url ?? a.images.jpg?.large_image_url ?? a.images.jpg?.image_url ?? null,
        overview: a.synopsis,
        total_episodes: a.episodes,
        subtype: a.type,
        runtime: parseJikanDuration(a.duration),
        ...(a.genres ? { genres: jikanGenres(a.genres), public_score: score(a.score) } : {}),
      }
    })
}

// Ontdekken: wat deze week populair is bij TMDB
export async function trendingTmdb(): Promise<CatalogResult[]> {
  const data = await tmdb<{ results: TmdbSearchItem[] }>('trending/all/week')
  return mapTmdbResults(data.results)
}

// Ontdekken: anime van dit seizoen of het volgende, populairste eerst
export async function seasonalAnime(which: 'now' | 'upcoming'): Promise<CatalogResult[]> {
  const res = await fetch(`${JIKAN}/seasons/${which}?${new URLSearchParams({ sfw: 'true', limit: '24' })}`)
  if (res.status === 429) throw new Error('MyAnimeList is even te druk. Probeer het over een paar seconden opnieuw.')
  if (!res.ok) throw new Error(`Jikan gaf foutcode ${res.status}`)
  const data: { data: (JikanAnime & { members?: number })[] } = await res.json()
  return mapJikanResults(data.data.sort((a, b) => (b.members ?? 0) - (a.members ?? 0)))
}

// Extra gegevens die niet in de zoekresultaten zitten, zoals de IMDb-ID en het aantal afleveringen.
export async function fetchExtraDetails(result: CatalogResult) {
  if (result.source === 'jikan') {
    let episodes = result.total_episodes
    let runtime = result.runtime ?? null
    let titles = { title: result.title, original_title: result.original_title }
    let genres = result.genres ?? null
    let public_score = result.public_score ?? null
    // Aanbevelingen van Jikan bevatten geen Engelse titel, aantal afleveringen, genres of speelduur; dan halen we die los op
    if (episodes === null || runtime === null || !result.original_title || genres === null) {
      const res = await fetch(`${JIKAN}/anime/${result.external_id}`)
      if (res.ok) {
        const data = (await res.json()).data
        episodes = data?.episodes ?? episodes
        runtime = parseJikanDuration(data?.duration) ?? runtime
        if (data?.title) titles = animeTitles(data.title, englishTitle(data))
        if (data?.genres) genres = jikanGenres(data.genres)
        public_score = score(data?.score) ?? public_score
      }
    }
    return { imdb_id: null, total_episodes: episodes, seasons: animeSeasons(episodes), runtime, ...titles, genres, public_score }
  }
  if (result.media_type === 'movie') {
    const movie = await tmdb<{ imdb_id: string | null; runtime: number | null; genres?: { id: number }[]; vote_average?: number }>(
      `movie/${result.external_id}`,
    )
    return {
      imdb_id: movie.imdb_id,
      total_episodes: null,
      seasons: null,
      runtime: movie.runtime || null,
      genres: tmdbGenres(movie.genres),
      public_score: score(movie.vote_average),
    }
  }
  const tv = await fetchTmdbShow(result.external_id)
  return {
    imdb_id: tv.imdb_id,
    total_episodes: totalEpisodes(tv.seasons),
    seasons: tv.seasons,
    runtime: tv.runtime,
    genres: tv.genres,
    public_score: tv.public_score,
  }
}

// Genres en publieksscore voor een titel die al in je lijst staat (voor titels van vóór deze functie)
export async function fetchGenres(item: { source: Source; media_type: MediaType; external_id: string }) {
  if (item.source === 'jikan') {
    const { data } = await jikan<{ data: { genres?: { name: string }[]; score?: number | null } }>(`anime/${item.external_id}`)
    return { genres: jikanGenres(data.genres), public_score: score(data.score) }
  }
  const data = await tmdb<{ genres?: { id: number }[]; vote_average?: number }>(`${item.media_type}/${item.external_id}`)
  return { genres: tmdbGenres(data.genres), public_score: score(data.vote_average) }
}

interface TmdbShow {
  external_ids?: { imdb_id: string | null }
  seasons?: { season_number: number; name: string; episode_count: number }[]
  status?: string
  next_episode_to_air?: { season_number: number; episode_number: number; air_date: string | null; runtime?: number | null } | null
  last_episode_to_air?: { runtime?: number | null } | null
  episode_run_time?: number[]
  genres?: { id: number }[]
  vote_average?: number
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
  return {
    imdb_id: tv.external_ids?.imdb_id ?? null,
    seasons,
    next_air,
    show_status: tv.status ?? null,
    runtime,
    genres: tmdbGenres(tv.genres),
    public_score: score(tv.vote_average),
  }
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

// Engelse titel uit Jikan: soms alleen in de lijst `titles` en niet in `title_english`
export function englishTitle(data: { title_english?: string | null; titles?: { type: string; title: string }[] }) {
  return data.title_english || data.titles?.find((t) => t.type === 'English')?.title || null
}

// Bij anime bewaren we de Engelse titel als `title` en de Japanse als `original_title`
export function animeTitles(japanese: string, english: string | null | undefined) {
  const title = english || japanese
  return { title, original_title: title !== japanese ? japanese : null }
}
