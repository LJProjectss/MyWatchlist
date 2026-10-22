import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { cacheItems, getCachedItems, getCachedWatched } from '../lib/cache'
import { followed, loadWeek, weekDays, weekStart, type CalendarEntry } from '../lib/calendar'
import { episodeLabel, loadWatched } from '../lib/episodes'
import { localDate } from '../lib/history'
import { supabase } from '../lib/supabase'
import { displayTitle } from '../lib/titles'
import type { WatchlistItem } from '../lib/types'

// Weekoverzicht van nieuwe afleveringen van series en anime die je volgt
export default function Calendar() {
  const [params, setParams] = useSearchParams()
  const offset = Number(params.get('week') ?? 0) || 0
  const [items, setItems] = useState<WatchlistItem[] | null>(getCachedItems)
  const [watched, setWatched] = useState(() => getCachedWatched() ?? new Map<string, Set<string>>())
  const [week, setWeek] = useState<{ offset: number; days: Map<string, CalendarEntry[]> } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('watchlist_items')
      .select('*')
      .order('updated_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (error) {
          if (!getCachedItems()) setError(error.message)
          return
        }
        const list = data as WatchlistItem[]
        setItems(list)
        cacheItems(list)
        setWatched(await loadWatched(followed(list)).catch(() => getCachedWatched() ?? new Map()))
      })
  }, [])

  useEffect(() => {
    if (!items) return
    let cancelled = false
    loadWeek(items, watched, weekStart(offset)).then((days) => !cancelled && setWeek({ offset, days }))
    return () => {
      cancelled = true
    }
  }, [items, watched, offset])

  const start = weekStart(offset)
  const days = weekDays(start)
  const today = localDate()
  const range = `${days[0].toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const go = (next: number) => setParams(next === 0 ? {} : { week: String(next) }, { replace: true })
  const loading = !week || week.offset !== offset

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kalender</h1>
          <p className="text-sm text-muted">{range}</p>
        </div>
        <div className="flex rounded-lg border border-line bg-panel p-1 text-sm">
          <button onClick={() => go(offset - 1)} aria-label="Vorige week" className="rounded-md px-3 py-1.5 text-muted hover:text-fg">
            ←
          </button>
          <button
            onClick={() => go(0)}
            disabled={offset === 0}
            className="rounded-md px-3 py-1.5 text-muted hover:text-fg disabled:text-fg"
          >
            Deze week
          </button>
          <button onClick={() => go(offset + 1)} aria-label="Volgende week" className="rounded-md px-3 py-1.5 text-muted hover:text-fg">
            →
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-bad">Laden mislukt: {error}</p>}
      {items && followed(items).length === 0 && (
        <p className="text-sm text-muted">
          Hier zie je nieuwe afleveringen van series en anime die nog uitkomen en die je volgt (aan het kijken, gekeken of
          gepauzeerd).
        </p>
      )}

      <div className={`grid gap-2 lg:grid-cols-7 ${loading ? 'opacity-60' : ''}`}>
        {days.map((day) => {
          const key = localDate(day)
          const entries = loading ? [] : (week.days.get(key) ?? [])
          const isToday = key === today
          return (
            <section
              key={key}
              className={`rounded-lg border bg-panel lg:min-h-40 ${isToday ? 'border-accent/60' : 'border-line'} ${
                entries.length === 0 ? 'flex items-center gap-3 px-3 py-2 lg:block lg:p-3' : 'space-y-2 p-3'
              }`}
            >
              <h2 className={`text-sm font-medium capitalize ${isToday ? 'text-accent-hover' : ''}`}>
                {day.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric' })}
                {isToday && <span className="ml-1.5 text-xs font-normal normal-case">vandaag</span>}
              </h2>
              {entries.length === 0 ? (
                <p className="text-xs text-muted lg:mt-2">{loading ? '…' : '—'}</p>
              ) : (
                <ul className="space-y-1.5">
                  {entries.map((e) => (
                    <li key={`${e.item.id}-${e.season_number}-${e.episode_number}`}>
                      <Link
                        to={`/titel/${e.item.id}`}
                        className="flex gap-2.5 rounded-md p-1.5 -m-1.5 hover:bg-panel-hover"
                      >
                        <div className="aspect-[2/3] w-9 shrink-0 overflow-hidden rounded bg-panel-hover">
                          {e.item.poster_url && <img src={e.item.poster_url} alt="" loading="lazy" className="size-full object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm leading-snug font-medium">{displayTitle(e.item)}</p>
                          <p className="text-xs text-muted">
                            {e.watched && <span className="text-good">✓ </span>}
                            {episodeLabel(e.item, e)}
                            {e.time && ` · ${e.time}`}
                            {e.estimated && ' (verwacht)'}
                          </p>
                          {e.name && <p className="truncate text-xs text-muted">{e.name}</p>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
