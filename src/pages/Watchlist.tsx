import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ContinueWatching from '../components/ContinueWatching'
import Upcoming from '../components/Upcoming'
import ProgressBar from '../components/ProgressBar'
import { totalEpisodes } from '../lib/catalog'
import {
  countWatched,
  epKey,
  hasEpisodes,
  loadWatched,
  needsRefresh,
  nextEpisode,
  refreshShowInfo,
  setEpisodesWatched,
  statusAfterProgress,
} from '../lib/episodes'
import { supabase } from '../lib/supabase'
import { formatRating, MEDIA_LABELS, STATUS_LABELS, type MediaType, type WatchStatus, type WatchlistItem } from '../lib/types'

type TypeFilter = MediaType | 'all'
type StatusFilter = WatchStatus | 'all'
type SortKey = keyof typeof SORTS

const SORTS = {
  recent: { label: 'Laatst bijgewerkt', compare: (a: WatchlistItem, b: WatchlistItem) => b.updated_at.localeCompare(a.updated_at) },
  added: { label: 'Laatst toegevoegd', compare: (a: WatchlistItem, b: WatchlistItem) => b.created_at.localeCompare(a.created_at) },
  title: { label: 'Titel (A–Z)', compare: (a: WatchlistItem, b: WatchlistItem) => a.title.localeCompare(b.title, 'nl') },
  rating: { label: 'Hoogste cijfer', compare: (a: WatchlistItem, b: WatchlistItem) => (b.rating ?? 0) - (a.rating ?? 0) },
  year: { label: 'Nieuwste eerst', compare: (a: WatchlistItem, b: WatchlistItem) => (b.year ?? 0) - (a.year ?? 0) },
}

export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Filters staan in de URL, zodat ze blijven staan als je terugkomt van een titel
  const [params, setParams] = useSearchParams()
  const typeFilter = (params.get('soort') ?? 'all') as TypeFilter
  const statusFilter = (params.get('status') ?? 'all') as StatusFilter
  const sort = (params.get('sorteer') && params.get('sorteer')! in SORTS ? params.get('sorteer') : 'recent') as SortKey
  const text = params.get('zoek') ?? ''

  function setParam(key: string, value: string, defaultValue: string) {
    const next = new URLSearchParams(params)
    if (value === defaultValue) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }
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
          loadWatched(loaded.filter(hasEpisodes))
            .then((map) => {
              setWatched(map)
              refreshInBackground(loaded, map)
            })
            .catch(() => {})
        }
        setLoading(false)
      })
  }, [])

  // Nieuwe afleveringen en uitzenddata ophalen voor series die je volgt (één voor één, i.v.m. limieten van Jikan)
  async function refreshInBackground(loaded: WatchlistItem[], map: Map<string, Set<string>>) {
    for (const item of loaded.filter(needsRefresh).slice(0, 15)) {
      const changes = await refreshShowInfo(item, map.get(item.id) ?? new Set()).catch(() => null)
      if (changes) setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...changes } : i)))
    }
  }

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
      await setEpisodesWatched(item, [next], true)
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

  const visible = useMemo(() => {
    const needle = text.trim().toLocaleLowerCase('nl')
    return items
      .filter(
        (i) =>
          (typeFilter === 'all' || i.media_type === typeFilter) &&
          (statusFilter === 'all' || i.status === statusFilter) &&
          (!needle || `${i.title} ${i.original_title ?? ''}`.toLocaleLowerCase('nl').includes(needle)),
      )
      .sort(SORTS[sort].compare)
  }, [items, typeFilter, statusFilter, sort, text])

  const filtered = visible.length !== items.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mijn lijst</h1>
        <p className="text-sm text-muted">
          {filtered ? `${visible.length} van ` : ''}
          {items.length} {items.length === 1 ? 'titel' : 'titels'}
        </p>
      </div>

      <ContinueWatching items={inProgress} watched={watched} onMarkNext={markNext} />
      <Upcoming items={items} />

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
          <input
            type="search"
            value={text}
            onChange={(e) => setParam('zoek', e.target.value, '')}
            placeholder="Zoek in je lijst…"
            className="col-span-2 min-w-0 rounded-md border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent sm:col-span-3 lg:flex-1"
          />
          <Select
            value={typeFilter}
            onChange={(v) => setParam('soort', v, 'all')}
            options={[['all', 'Alle soorten'], ...Object.entries(MEDIA_LABELS)]}
          />
          <Select
            value={statusFilter}
            onChange={(v) => setParam('status', v, 'all')}
            options={[['all', 'Elke status'], ...Object.entries(STATUS_LABELS)]}
          />
          <Select
            value={sort}
            onChange={(v) => setParam('sorteer', v, 'recent')}
            options={Object.entries(SORTS).map(([key, { label }]) => [key, label])}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      )}

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
                    {item.rating && <span className="font-semibold text-amber-400">★ {formatRating(item.rating)}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!loading && items.length > 0 && visible.length === 0 && (
        <div className="space-y-2">
          <p className="text-muted">Geen titels die bij deze filters passen.</p>
          <button onClick={() => setParams({}, { replace: true })} className="text-sm text-accent-hover hover:underline">
            Filters wissen
          </button>
        </div>
      )}
    </div>
  )
}

function Select({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  options: [string, string][]
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`min-w-0 rounded-md border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent ${className}`}
    >
      {options.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  )
}
