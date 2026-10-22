import { fetchTmdbShow, JIKAN, parseJikanDuration, tmdb } from './catalog'
import { supabase } from './supabase'
import type { WatchlistItem } from './types'

export interface WatchSession {
  date: string // yyyy-mm-dd
  minutes: number
}

interface EpisodeRow {
  item_id: string
  watched_at: string
}

interface HistoryRow {
  item_id: string
  watched_on: string
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data as T[]))
    if (data.length < 1000) return rows
  }
}

// Elke bekeken aflevering telt (ook bij herkijken); films tellen per keer in de kijkgeschiedenis.
// Een film op "gekeken" zonder datum telt één keer mee, op de dag dat hij laatst is bijgewerkt.
export async function loadWatchSessions(items: WatchlistItem[]): Promise<WatchSession[]> {
  const byId = new Map(items.map((i) => [i.id, i]))
  const [episodes, history] = await Promise.all([
    fetchAll<EpisodeRow>('watched_episodes', 'item_id, watched_at'),
    fetchAll<HistoryRow>('watch_history', 'item_id, watched_on'),
  ])
  const sessions: WatchSession[] = []
  for (const e of episodes) {
    const runtime = byId.get(e.item_id)?.runtime
    if (runtime) sessions.push({ date: e.watched_at.slice(0, 10), minutes: runtime })
  }
  const moviesWithHistory = new Set<string>()
  for (const h of history) {
    const item = byId.get(h.item_id)
    if (item?.media_type !== 'movie') continue
    moviesWithHistory.add(item.id)
    if (item.runtime) sessions.push({ date: h.watched_on, minutes: item.runtime })
  }
  for (const item of items) {
    if (item.media_type === 'movie' && item.status === 'completed' && !moviesWithHistory.has(item.id) && item.runtime) {
      sessions.push({ date: item.updated_at.slice(0, 10), minutes: item.runtime })
    }
  }
  return sessions
}

// Titels die wel kijktijd hebben maar nog geen speelduur: die halen we op en slaan we op
export function needsRuntime(item: WatchlistItem) {
  return !item.runtime && item.status !== 'plan_to_watch'
}

export async function fetchRuntime(item: WatchlistItem): Promise<number | null> {
  if (item.source === 'jikan') {
    const res = await fetch(`${JIKAN}/anime/${item.external_id}`)
    if (!res.ok) return null
    return parseJikanDuration((await res.json()).data?.duration)
  }
  if (item.media_type === 'movie') return (await tmdb<{ runtime: number | null }>(`movie/${item.external_id}`)).runtime || null
  return (await fetchTmdbShow(item.external_id)).runtime
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  if (hours === 0) return `${minutes} min`
  if (hours < 10) return `${hours} u ${minutes % 60} min`
  return `${hours.toLocaleString('nl-NL')} uur`
}
