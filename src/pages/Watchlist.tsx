import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ContinueWatching from '../components/ContinueWatching'
import ProgressBar from '../components/ProgressBar'
import { totalEpisodes } from '../lib/catalog'
import {
  countWatched,
  epKey,
  hasEpisodes,
  loadWatched,
  nextEpisode,
  setEpisodesWatched,
  statusAfterProgress,
} from '../lib/episodes'
import { supabase } from '../lib/supabase'
import { MEDIA_LABELS, STATUS_LABELS, type MediaType, type WatchStatus, type WatchlistItem } from '../lib/types'

type TypeFilter = MediaType | 'all'
type StatusFilter = WatchStatus | 'all'

export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [watched, setWatched] = useState<Map<string, Set<string>>>(new Map())

  useEffect(() => {
    supabase
      .from('watchlist_items')
      .select('*')
      .order('updated_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (error) {
          setError(error.message)
        } else {
          const loaded = data as WatchlistItem[]
          setItems(loaded)
          // Zonder afleveringsvoortgang werkt de lijst nog steeds, dus een fout hier negeren we
          loadWatched(loaded.filter(hasEpisodes).map((i) => i.id))
            .then(setWatched)
            .catch(() => {})
        }
        setLoading(false)
      })
  }, [])

  const inProgress = useMemo(
    () => items.filter((i) => i.status === 'watching' && hasEpisodes(i) && i.seasons?.length),
    [items],
  )

  async function markNext(item: WatchlistItem) {
    const seen = watched.get(item.id) ?? new Set<string>()
    const next = nextEpisode(item.seasons, seen)
    if (!next) return
    const updated = new Set(seen).add(epKey(next.season_number, next.episode_number))
    setWatched((prev) => new Map(prev).set(item.id, updated))
    try {
      await setEpisodesWatched(item.id, [next], true)
      const status = statusAfterProgress(item, countWatched(item.seasons, updated))
      if (status !== item.status) {
        await supabase.from('watchlist_items').update({ status }).eq('id', item.id)
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)))
      }
    } catch (e) {
      setWatched((prev) => new Map(prev).set(item.id, seen))
      setError(`Opslaan mislukt: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const visible = useMemo(
    () =>
      items.filter(
        (i) => (typeFilter === 'all' || i.media_type === typeFilter) && (statusFilter === 'all' || i.status === statusFilter),
      ),
    [items, typeFilter, statusFilter],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mijn lijst</h1>
          <p className="text-sm text-muted">
            {items.length} {items.length === 1 ? 'titel' : 'titels'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as TypeFilter)}
            options={[['all', 'Alle soorten'], ...Object.entries(MEDIA_LABELS)]}
          />
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[['all', 'Elke status'], ...Object.entries(STATUS_LABELS)]}
          />
        </div>
      </div>

      <ContinueWatching items={inProgress} watched={watched} onMarkNext={markNext} />

      {loading && <p className="text-muted">Laden…</p>}
      {error && <p className="text-red-400">Kon je lijst niet laden: {error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center">
          <p className="text-lg font-medium">Je lijst is nog leeg</p>
          <p className="mt-1 text-sm text-muted">Zoek een film, serie of anime om te beginnen.</p>
          <Link
            to="/zoeken"
            className="mt-6 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Titel zoeken
          </Link>
        </div>
      )}

      {visible.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((item) => (
            <li key={item.id}>
              <Link
                to={`/titel/${item.id}`}
                className="block h-full overflow-hidden rounded-lg border border-line bg-panel transition hover:border-accent/60"
              >
                <div className="aspect-[2/3] bg-panel-hover">
                  {item.poster_url && (
                    <img src={item.poster_url} alt="" loading="lazy" className="size-full object-cover" />
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</p>
                  <p className="text-xs text-muted">
                    {MEDIA_LABELS[item.media_type]}
                    {item.year ? ` · ${item.year}` : ''}
                  </p>
                  {hasEpisodes(item) && watched.has(item.id) && (
                    <ProgressBar
                      value={countWatched(item.seasons, watched.get(item.id)!)}
                      max={totalEpisodes(item.seasons) ?? 0}
                      className="mt-2"
                    />
                  )}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-muted">{STATUS_LABELS[item.status]}</span>
                    {item.rating && <span className="font-semibold text-amber-400">★ {item.rating}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!loading && items.length > 0 && visible.length === 0 && (
        <p className="text-muted">Geen titels die bij deze filters passen.</p>
      )}
    </div>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: [string, string][]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
    >
      {options.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  )
}
