import { tmdb } from './catalog'
import { epKey, hasEpisodes } from './episodes'
import { localDate } from './history'
import type { WatchlistItem } from './types'

export interface CalendarEntry {
  item: WatchlistItem
  season_number: number
  episode_number: number
  name: string | null
  // Lokale datum (JJJJ-MM-DD) en, als bekend, het tijdstip
  date: string
  time: string | null
  // Voor anime schatten we de datum op basis van de vaste uitzenddag
  estimated: boolean
  watched: boolean
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

// Series en anime die je volgt en die nog uitzenden
export function followed(items: WatchlistItem[]) {
  return items.filter((i) => hasEpisodes(i) && ['watching', 'completed', 'on_hold'].includes(i.status) && i.next_air)
}

export function weekStart(offset: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7)
  return d
}

export function weekDays(start: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
}

// TMDB-seizoenen veranderen zelden; binnen een sessie maar één keer ophalen
const seasonCache = new Map<string, Promise<{ episode_number: number; name: string; air_date: string | null }[]>>()

function tmdbSeason(id: string, season: number) {
  const key = `${id}:${season}`
  if (!seasonCache.has(key)) {
    seasonCache.set(
      key,
      tmdb<{ episodes: { episode_number: number; name: string; air_date: string | null }[] }>(`tv/${id}/season/${season}`)
        .then((d) => d.episodes)
        .catch((e) => {
          seasonCache.delete(key)
          throw e
        }),
    )
  }
  return seasonCache.get(key)!
}

export async function loadWeek(items: WatchlistItem[], watched: Map<string, Set<string>>, start: Date) {
  const days = weekDays(start).map((d) => localDate(d))
  const from = days[0]
  const to = days[6]
  const end = start.getTime() + WEEK

  const perItem = await Promise.all(
    followed(items).map(async (item): Promise<CalendarEntry[]> => {
      const seen = watched.get(item.id) ?? new Set<string>()
      const entry = (season_number: number, episode_number: number, rest: Omit<CalendarEntry, 'item' | 'season_number' | 'episode_number' | 'watched'>) => ({
        item,
        season_number,
        episode_number,
        ...rest,
        watched: seen.has(epKey(season_number, episode_number)),
      })

      if (item.source === 'tmdb') {
        const season = item.next_air!.season_number
        const episodes = await tmdbSeason(item.external_id, season).catch(() => [])
        return episodes
          .filter((e) => e.air_date && e.air_date >= from && e.air_date <= to)
          .map((e) => entry(season, e.episode_number, { name: e.name || null, date: e.air_date!, time: null, estimated: false }))
      }

      // Anime: vanaf de eerstvolgende uitzending elke week één aflevering
      const slot = parseBroadcast(item.next_air!.broadcast)
      if (!slot) return []
      const next = item.next_air!.episode_number
      const total = item.seasons?.[0]?.episode_count ?? 0
      const last = total >= next ? total : Infinity
      const base = nextBroadcast(item.info_refreshed_at ? Date.parse(item.info_refreshed_at) : Date.now(), slot)
      const result: CalendarEntry[] = []
      for (let k = Math.ceil((start.getTime() - base) / WEEK); base + k * WEEK < end; k++) {
        const ep = next + k
        if (ep < 1 || ep > last) continue
        const at = new Date(base + k * WEEK)
        result.push(
          entry(1, ep, {
            name: null,
            date: localDate(at),
            time: at.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
            estimated: true,
          }),
        )
      }
      return result
    }),
  )

  const byDay = new Map(days.map((d) => [d, [] as CalendarEntry[]]))
  for (const e of perItem.flat()) byDay.get(e.date)?.push(e)
  for (const list of byDay.values()) list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  return byDay
}

const DAY_INDEX: Record<string, number> = {
  Sundays: 0, Mondays: 1, Tuesdays: 2, Wednesdays: 3, Thursdays: 4, Fridays: 5, Saturdays: 6,
}

// "Fridays at 23:00 (JST)" → dag en tijd in Japanse tijd
function parseBroadcast(broadcast: string | null | undefined) {
  const m = broadcast?.match(/^(\w+days) at (\d{1,2}):(\d{2})/)
  if (!m || DAY_INDEX[m[1]] === undefined) return null
  return { day: DAY_INDEX[m[1]], hour: Number(m[2]), minute: Number(m[3]) }
}

// Eerstvolgende uitzending na een bepaald moment (Japan is UTC+9, zonder zomertijd)
function nextBroadcast(after: number, slot: { day: number; hour: number; minute: number }) {
  const jst = new Date(after + 9 * HOUR)
  let at = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), slot.hour, slot.minute) - 9 * HOUR
  at += ((slot.day - jst.getUTCDay() + 7) % 7) * DAY
  if (at <= after) at += WEEK
  return at
}
