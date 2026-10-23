import { animeSeasons, animeTitles, englishTitle, fetchTmdbShow, parseJikanDuration, tmdb, totalEpisodes } from './catalog'
import { jikan } from './jikan'
import { jikanGenres, score } from './genres'
import { withNewFields } from './schemaVersion'
import { attempt, syncPending } from './offline'
import { selectAll, supabase } from './supabase'
import type { NextAir, SeasonInfo, WatchStatus, WatchlistItem } from './types'

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

export interface ShowInfo {
  titles?: { title: string; original_title: string | null }
  runtime: number | null
  seasons: SeasonInfo[] | null
  next_air: NextAir | null
  show_status: string | null
  genres?: string[]
  public_score?: number | null
}

// Actuele seizoensindeling en volgende uitzending ophalen; nieuwe afleveringen komen zo vanzelf in je lijst.
export async function fetchShowInfo(item: WatchlistItem): Promise<ShowInfo> {
  if (item.source === 'tmdb') {
    const { seasons, next_air, show_status, runtime, genres, public_score } = await fetchTmdbShow(item.external_id)
    return { seasons, next_air, show_status, runtime, genres, public_score }
  }

  const { data } = await jikan<{ data: any }>(`anime/${item.external_id}`) // eslint-disable-line @typescript-eslint/no-explicit-any
  const airing = data.status === 'Currently Airing'
  const runtime = parseJikanDuration(data.duration)
  const titles = data.title ? animeTitles(data.title, englishTitle(data)) : undefined
  const meta = { genres: jikanGenres(data.genres), public_score: score(data.score) }
  if (!airing) {
    return { seasons: animeSeasons(data.episodes), next_air: null, show_status: data.status ?? null, runtime, titles, ...meta }
  }

  // Bij lopende anime tellen we hoeveel afleveringen er al zijn; de volgende is dan de eerstvolgende uitzending
  const first = await jikanEpisodePage(item.external_id, 1)
  const lastPage = first.pagination.last_visible_page
  let aired = first.data.length
  if (lastPage > 1) {
    aired = (lastPage - 1) * 100 + (await jikanEpisodePage(item.external_id, lastPage)).data.length
  }
  return {
    seasons: animeSeasons(Math.max(data.episodes ?? 0, aired)),
    next_air: {
      season_number: 1,
      episode_number: aired + 1,
      air_date: null,
      broadcast: data.broadcast?.string ?? null,
    },
    show_status: data.status,
    runtime,
    titles,
    ...meta,
  }
}

// Gegevens verversen en opslaan als ze veranderd zijn. Staat een lopende serie op "gekeken"
// en zijn er nieuwe afleveringen, dan zetten we hem terug naar "aan het kijken".
export async function refreshShowInfo(item: WatchlistItem, watched: Set<string>): Promise<Partial<WatchlistItem>> {
  const info = await fetchShowInfo(item)
  const changes: Partial<WatchlistItem> = { info_refreshed_at: new Date().toISOString() }
  if (info.seasons && JSON.stringify(info.seasons) !== JSON.stringify(item.seasons)) {
    changes.seasons = info.seasons
    changes.total_episodes = totalEpisodes(info.seasons)
  }
  if (JSON.stringify(info.next_air) !== JSON.stringify(item.next_air)) changes.next_air = info.next_air
  if (info.show_status !== item.show_status) changes.show_status = info.show_status
  if (info.runtime && info.runtime !== item.runtime) changes.runtime = info.runtime
  if (info.genres && JSON.stringify(info.genres) !== JSON.stringify(item.genres)) changes.genres = info.genres
  if (info.public_score !== undefined && info.public_score !== item.public_score) changes.public_score = info.public_score
  if (info.titles && (info.titles.title !== item.title || info.titles.original_title !== item.original_title)) {
    Object.assign(changes, info.titles)
  }

  const updated = { ...item, ...changes }
  if (item.status === 'completed' && nextEpisode(updated.seasons, watched) && isAired(updated, nextEpisode(updated.seasons, watched)!)) {
    changes.status = 'watching'
  }
  await supabase.from('watchlist_items').update(await withNewFields(changes, ['genres', 'public_score'])).eq('id', item.id)
  return changes
}

const TITLE_CHECK_SINCE = '2026-10-22T17:00:00Z'

const REFRESH_AFTER_MS = 12 * 60 * 60 * 1000

export function needsRefresh(item: WatchlistItem) {
  // Anime zonder Engelse titel één keer opnieuw controleren sinds die functie bestaat,
  // ook als ze op "wil ik zien" staan
  if (item.source === 'jikan' && !item.original_title && (item.info_refreshed_at ?? '') < TITLE_CHECK_SINCE) return true
  if (!hasEpisodes(item) || item.status === 'dropped' || item.status === 'plan_to_watch') return false
  if (!item.info_refreshed_at) return true
  return Date.now() - new Date(item.info_refreshed_at).getTime() > REFRESH_AFTER_MS
}

// Is deze aflevering al uitgezonden? Alles vanaf de volgende geplande uitzending nog niet.
export function isAired(item: Pick<WatchlistItem, 'next_air'>, ep: EpisodeRef) {
  const next = item.next_air
  if (!next) return true
  if (ep.season_number !== next.season_number) return ep.season_number < next.season_number
  return ep.episode_number < next.episode_number
}

export function formatAirDate(date: string) {
  return new Date(date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
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

function jikanEpisodePage(id: string, page: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jikan<any>(`anime/${id}/episodes?page=${page}`)
}


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
  // Eerst offline afgevinkte afleveringen versturen, anders lijken ze even verdwenen
  await syncPending()
  const currentWatch = new Map(items.map((i) => [i.id, i.current_watch ?? 1]))
  // In stukken van 1000 ophalen. Bij een lange lijst niet op titel filteren (de adresregel wordt dan te lang);
  // je ziet sowieso alleen je eigen afleveringen.
  const ids = items.map((i) => i.id)
  const rows = await selectAll<{ item_id: string; watch_number: number; season_number: number; episode_number: number }>(
    'watched_episodes',
    'id, item_id, watch_number, season_number, episode_number',
    (query) => (ids.length === 1 ? query.eq('item_id', ids[0]) : ids.length <= 50 ? query.in('item_id', ids) : query),
  )
  for (const row of rows) {
    if (!currentWatch.has(row.item_id)) continue
    if ((row.watch_number ?? 1) !== currentWatch.get(row.item_id)) continue
    if (!byItem.has(row.item_id)) byItem.set(row.item_id, new Set())
    byItem.get(row.item_id)!.add(epKey(row.season_number, row.episode_number))
  }
  return byItem
}

// Afvinken werkt ook offline: dan wordt het opgeslagen zodra je weer verbinding hebt
export async function setEpisodesWatched(
  item: Pick<WatchlistItem, 'id' | 'current_watch'>,
  episodes: EpisodeRef[],
  watched: boolean,
) {
  if (episodes.length === 0) return
  await attempt({ kind: 'episodes', itemId: item.id, watchNumber: item.current_watch ?? 1, episodes, watched })
}

export async function writeEpisodes(itemId: string, watchNumber: number, episodes: EpisodeRef[], watched: boolean) {
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

const DAYS: Record<string, string> = {
  Mondays: 'maandag', Tuesdays: 'dinsdag', Wednesdays: 'woensdag', Thursdays: 'donderdag',
  Fridays: 'vrijdag', Saturdays: 'zaterdag', Sundays: 'zondag',
}

// "S3 · A4 op za 25 okt" of voor anime "Afl. 12, elke vrijdag om 23:00 (JST)"
export function describeNextAir(item: Pick<WatchlistItem, 'media_type' | 'next_air'>) {
  const next = item.next_air
  if (!next) return null
  const label = episodeLabel(item, next)
  if (next.air_date) return `${label} op ${formatAirDate(next.air_date)}`
  if (next.broadcast) {
    const broadcast = next.broadcast.replace(/^(\w+days)/, (d) => `elke ${DAYS[d] ?? d}`).replace(' at ', ' om ')
    return `${label}, ${broadcast}`
  }
  return `${label}, datum nog onbekend`
}
