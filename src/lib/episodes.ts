import { animeSeasons, fetchTmdbShow, JIKAN, tmdb, totalEpisodes } from './catalog'
import { supabase } from './supabase'
import type { SeasonInfo, WatchStatus, WatchlistItem } from './types'

export interface EpisodeInfo {
  episode_number: number
  name: string | null
  air_date: string | null
}

export interface EpisodeRef {
  season_number: number
  episode_number: number
}

export const epKey = (season: number, episode: number) => `${season}:${episode}`

export function hasEpisodes(item: Pick<WatchlistItem, 'media_type'>) {
  return item.media_type !== 'movie'
}

export function episodeLabel(item: Pick<WatchlistItem, 'media_type'>, ep: EpisodeRef) {
  return item.media_type === 'anime' ? `Afl. ${ep.episode_number}` : `S${ep.season_number} · A${ep.episode_number}`
}

// Actuele seizoensindeling ophalen; nieuwe afleveringen komen zo vanzelf in je lijst.
export async function fetchSeasons(item: WatchlistItem): Promise<SeasonInfo[] | null> {
  if (item.source === 'tmdb') return (await fetchTmdbShow(item.external_id)).seasons

  const res = await fetch(`${JIKAN}/anime/${item.external_id}`)
  if (!res.ok) throw new Error(`Jikan gaf foutcode ${res.status}`)
  const { data } = await res.json()
  if (data.episodes) return animeSeasons(data.episodes)

  // Lopende anime hebben nog geen totaal; tel dan de afleveringen die er al zijn
  const first = await jikanEpisodePage(item.external_id, 1)
  const lastPage = first.pagination.last_visible_page
  if (lastPage <= 1) return animeSeasons(first.data.length)
  await pause()
  const last = await jikanEpisodePage(item.external_id, lastPage)
  return animeSeasons((lastPage - 1) * 100 + last.data.length)
}

export async function fetchEpisodes(item: WatchlistItem, season: SeasonInfo): Promise<EpisodeInfo[]> {
  let episodes: EpisodeInfo[] = []
  if (item.source === 'tmdb') {
    const data = await tmdb<{ episodes: { episode_number: number; name: string; air_date: string | null }[] }>(
      `tv/${item.external_id}/season/${season.season_number}`,
    )
    episodes = data.episodes.map((e) => ({ episode_number: e.episode_number, name: e.name || null, air_date: e.air_date }))
  } else {
    for (let page = 1; ; page++) {
      if (page > 1) await pause()
      const data = await jikanEpisodePage(item.external_id, page)
      episodes.push(
        ...data.data.map((e: { mal_id: number; title: string | null; aired: string | null }) => ({
          episode_number: e.mal_id,
          name: e.title,
          air_date: e.aired?.slice(0, 10) ?? null,
        })),
      )
      if (!data.pagination.has_next_page) break
    }
  }

  // Ontbrekende afleveringen aanvullen, zodat je ze toch kunt afvinken
  const known = new Set(episodes.map((e) => e.episode_number))
  for (let n = 1; n <= season.episode_count; n++) {
    if (!known.has(n)) episodes.push({ episode_number: n, name: null, air_date: null })
  }
  return episodes.sort((a, b) => a.episode_number - b.episode_number)
}

async function jikanEpisodePage(id: string, page: number) {
  const res = await fetch(`${JIKAN}/anime/${id}/episodes?page=${page}`)
  if (!res.ok) throw new Error(`Jikan gaf foutcode ${res.status}`)
  return res.json()
}

// Jikan staat maximaal 3 verzoeken per seconde toe
const pause = () => new Promise((resolve) => setTimeout(resolve, 400))

export function nextEpisode(seasons: SeasonInfo[] | null, watched: Set<string>): EpisodeRef | null {
  for (const season of seasons ?? []) {
    for (let n = 1; n <= season.episode_count; n++) {
      if (!watched.has(epKey(season.season_number, n))) return { season_number: season.season_number, episode_number: n }
    }
  }
  return null
}

export function countWatched(seasons: SeasonInfo[] | null, watched: Set<string>) {
  let count = 0
  for (const season of seasons ?? []) {
    for (let n = 1; n <= season.episode_count; n++) if (watched.has(epKey(season.season_number, n))) count++
  }
  return count
}

// Voortgang van de huidige kijkbeurt; afleveringen van eerdere keren kijken blijven bewaard maar tellen niet mee
export async function loadWatched(items: Pick<WatchlistItem, 'id' | 'current_watch'>[]) {
  const byItem = new Map<string, Set<string>>()
  if (items.length === 0) return byItem
  const currentWatch = new Map(items.map((i) => [i.id, i.current_watch ?? 1]))
  const { data, error } = await supabase
    .from('watched_episodes')
    .select('item_id, watch_number, season_number, episode_number')
    .in('item_id', items.map((i) => i.id))
  if (error) throw new Error(error.message)
  for (const row of data) {
    if ((row.watch_number ?? 1) !== currentWatch.get(row.item_id)) continue
    if (!byItem.has(row.item_id)) byItem.set(row.item_id, new Set())
    byItem.get(row.item_id)!.add(epKey(row.season_number, row.episode_number))
  }
  return byItem
}

export async function setEpisodesWatched(
  item: Pick<WatchlistItem, 'id' | 'current_watch'>,
  episodes: EpisodeRef[],
  watched: boolean,
) {
  if (episodes.length === 0) return
  const itemId = item.id
  const watchNumber = item.current_watch ?? 1
  if (watched) {
    const { error } = await supabase
      .from('watched_episodes')
      .upsert(
        episodes.map((e) => ({ item_id: itemId, watch_number: watchNumber, ...e })),
        { onConflict: 'item_id,watch_number,season_number,episode_number', ignoreDuplicates: true },
      )
    if (error) throw new Error(error.message)
    return
  }
  // Per seizoen verwijderen houdt het aantal aanroepen laag
  const bySeason = new Map<number, number[]>()
  for (const e of episodes) bySeason.set(e.season_number, [...(bySeason.get(e.season_number) ?? []), e.episode_number])
  for (const [season, numbers] of bySeason) {
    const { error } = await supabase
      .from('watched_episodes')
      .delete()
      .eq('item_id', itemId)
      .eq('watch_number', watchNumber)
      .eq('season_number', season)
      .in('episode_number', numbers)
    if (error) throw new Error(error.message)
  }
}

// Status volgt je voortgang: eerste aflevering → aan het kijken, alles gezien → gekeken
export function statusAfterProgress(item: WatchlistItem, watchedCount: number): WatchStatus {
  const total = totalEpisodes(item.seasons)
  if (total && watchedCount >= total) return 'completed'
  if (watchedCount > 0 && (item.status === 'plan_to_watch' || item.status === 'completed')) return 'watching'
  return item.status
}
