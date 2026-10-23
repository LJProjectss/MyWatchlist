import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ContinueWatching from '../components/ContinueWatching'
import Upcoming from '../components/Upcoming'
import Reminders from '../components/Reminders'
import ProgressBar from '../components/ProgressBar'
import { fetchGenres, totalEpisodes } from '../lib/catalog'
import {
  countWatched,
  epKey,
  episodeLabel,
  hasEpisodes,
  isAired,
  loadWatched,
  needsRefresh,
  nextEpisode,
  refreshShowInfo,
  setEpisodesWatched,
  statusAfterProgress,
} from '../lib/episodes'
import { cacheItems, cacheWatched, getCachedItems, getCachedWatched } from '../lib/cache'
import { recordCompletion } from '../lib/history'
import { loadItems } from '../lib/items'
import { supabase } from '../lib/supabase'
import { databaseIsUpToDate } from '../lib/schemaVersion'
import { syncPending, updateItem } from '../lib/offline'
import { formatRating, MEDIA_LABELS, PRIORITY_LABELS, STATUS_LABELS, type Priority, type MediaType, type WatchStatus, type WatchlistItem } from '../lib/types'
import { displayTitle } from '../lib/titles'
import { showToast } from '../lib/toast'
import { deleteItems, restoreItems, type DeletedItems } from '../lib/trash'
import { statusChanges } from '../lib/reminders'
import BulkBar from '../components/BulkBar'

type TypeFilter = MediaType | 'all'
type StatusFilter = WatchStatus | 'all'
type SortKey = keyof typeof SORTS

const FILTER_COLUMNS: Record<number, string> = { 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4', 5: 'sm:grid-cols-5' }

const PRIORITY_DOT: Record<Priority, string> = { 1: 'bg-rose-400', 2: 'bg-sky-400', 3: 'bg-slate-400' }

const SORTS = {
  recent: { label: 'Laatst bijgewerkt', compare: (a: WatchlistItem, b: WatchlistItem) => b.updated_at.localeCompare(a.updated_at) },
  added: { label: 'Laatst toegevoegd', compare: (a: WatchlistItem, b: WatchlistItem) => b.created_at.localeCompare(a.created_at) },
  title: { label: 'Titel (A–Z)', compare: (a: WatchlistItem, b: WatchlistItem) => displayTitle(a).localeCompare(displayTitle(b), 'nl') },
  rating: { label: 'Hoogste cijfer', compare: (a: WatchlistItem, b: WatchlistItem) => (b.rating ?? 0) - (a.rating ?? 0) },
  year: { label: 'Nieuwste eerst', compare: (a: WatchlistItem, b: WatchlistItem) => (b.year ?? 0) - (a.year ?? 0) },
  priority: {
    label: 'Prioriteit',
    compare: (a: WatchlistItem, b: WatchlistItem) =>
      (a.priority ?? 4) - (b.priority ?? 4) || b.created_at.localeCompare(a.created_at),
  },
}

export default function Watchlist() {
  // Eerst de onthouden lijst tonen; de verse versie wordt op de achtergrond opgehaald
  const [items, setItems] = useState<WatchlistItem[]>(() => getCachedItems() ?? [])
  const [loading, setLoading] = useState(() => getCachedItems() === null)
  const [error, setError] = useState<string | null>(null)
  // Filters staan in de URL, zodat ze blijven staan als je terugkomt van een titel
  const [params, setParams] = useSearchParams()
  const typeFilter = (params.get('soort') ?? 'all') as TypeFilter
  const statusFilter = (params.get('status') ?? 'all') as StatusFilter
  // De Wil ik zien-lijst staat standaard op prioriteit
  const defaultSort: SortKey = statusFilter === 'plan_to_watch' ? 'priority' : 'recent'
  const sort = (params.get('sorteer') && params.get('sorteer')! in SORTS ? params.get('sorteer') : defaultSort) as SortKey
  const tagFilter = params.get('label') ?? 'all'
  const genreFilter = params.get('genre') ?? 'all'
  const text = params.get('zoek') ?? ''

  function setParam(key: string, value: string, defaultValue: string) {
    const next = new URLSearchParams(params)
    if (value === defaultValue) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }
  const [watched, setWatched] = useState<Map<string, Set<string>>>(() => getCachedWatched() ?? new Map())

  useEffect(() => {
    if (!loading) cacheItems(items)
  }, [items, loading])
  useEffect(() => {
    if (!loading) cacheWatched(watched)
  }, [watched, loading])

  // Nieuwe afleveringen en uitzenddata ophalen voor series die je volgt (één voor één, i.v.m. limieten van Jikan)
  async function refreshInBackground(loaded: WatchlistItem[], map: Map<string, Set<string>>) {
    for (const item of loaded.filter(needsRefresh).slice(0, 15)) {
      const changes = await refreshShowInfo(item, map.get(item.id) ?? new Set()).catch(() => null)
      if (changes) setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...changes } : i)))
      // Jikan staat maar een paar verzoeken per seconde toe
      if (item.source === 'jikan') await new Promise((resolve) => setTimeout(resolve, 1200))
    }
  }

  // Genres en publieksscore ophalen voor titels die er al stonden voordat de app dat bijhield
  async function fillGenres(loaded: WatchlistItem[]) {
    if (!(await databaseIsUpToDate())) return
    for (const item of loaded.filter((i) => i.genres === null).slice(0, 40)) {
      const changes = await fetchGenres(item).catch(() => null)
      if (!changes) continue
      const { error } = await supabase.from('watchlist_items').update(changes).eq('id', item.id)
      if (!error) setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...changes } : i)))
    }
  }

  useEffect(() => {
    // Eerst offline gemaakte wijzigingen versturen, zodat de lijst daarna klopt
    void syncPending().finally(() =>
      loadItems().then(async ({ data, error }) => {
          if (error) {
            // Met een onthouden lijst is een mislukte verversing geen reden om niets te tonen
            if (!getCachedItems()) setError(error.message)
          } else {
            const loaded = data as WatchlistItem[]
            setItems(loaded)
            // Zonder afleveringsvoortgang werkt de lijst nog steeds, dus een fout hier negeren we
            loadWatched(loaded.filter(hasEpisodes))
              .then(async (map) => {
                setWatched(map)
                await refreshInBackground(loaded, map)
              })
              .catch(() => {})
              .finally(() => fillGenres(loaded))
          }
          setLoading(false)
        })
    )
  }, [])

  // Verwijderd en daarna ongedaan gemaakt (ook vanaf de titelpagina): meteen weer tonen
  useEffect(() => {
    function restored(e: Event) {
      const { items: back } = (e as CustomEvent<DeletedItems>).detail
      const ids = new Set(back.map((i) => i.id))
      setItems((prev) => [...back, ...prev.filter((i) => !ids.has(i.id))].sort(SORTS.recent.compare))
      void loadWatched(back.filter(hasEpisodes)).then((map) =>
        setWatched((prev) => new Map([...prev, ...map])),
      ).catch(() => {})
    }
    window.addEventListener('items-restored', restored)
    return () => window.removeEventListener('items-restored', restored)
  }, [])

  const inProgress = useMemo(
    () => items.filter((i) => i.status === 'watching' && hasEpisodes(i) && i.seasons?.length),
    [items],
  )

  async function changeReminder(item: WatchlistItem, changes: Partial<WatchlistItem>) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...changes } : i)))
    try {
      await updateItem(item.id, changes)
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)))
      showToast({ text: `Opslaan mislukt: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  async function markNext(item: WatchlistItem) {
    const seen = watched.get(item.id) ?? new Set<string>()
    const next = nextEpisode(item.seasons, seen)
    if (!next || !isAired(item, next)) return
    const updated = new Set(seen).add(epKey(next.season_number, next.episode_number))
    setWatched((prev) => new Map(prev).set(item.id, updated))
    try {
      await setEpisodesWatched(item, [next], true)
      const status = statusAfterProgress(item, countWatched(item.seasons, updated))
      if (status !== item.status) {
        await updateItem(item.id, { status })
        if (status === 'completed') await recordCompletion(item.id).catch(() => {})
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)))
      }
      showToast({
        text: `${displayTitle(item)}: ${episodeLabel(item, next)} afgevinkt`,
        undo: async () => {
          await setEpisodesWatched(item, [next], false)
          setWatched((prev) => new Map(prev).set(item.id, seen))
          if (status !== item.status) {
            await updateItem(item.id, { status: item.status })
            setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)))
          }
        },
      })
    } catch (e) {
      setWatched((prev) => new Map(prev).set(item.id, seen))
      showToast({ text: `Opslaan mislukt: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  // Posters of een compacte lijst; onthouden op dit apparaat
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('list-view') === 'list' ? 'list' : 'grid'
    } catch {
      return 'grid'
    }
  })
  function changeView(next: 'grid' | 'list') {
    setView(next)
    try {
      localStorage.setItem('list-view', next)
    } catch {
      // niet onthouden, geen probleem
    }
  }

  // Meerdere titels tegelijk aanpassen: null = niet aan het selecteren
  const [selected, setSelected] = useState<Set<string> | null>(null)
  function toggleSelected(id: string) {
    setSelected((prev) => {
      if (!prev) return prev
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkChange(chosen: WatchlistItem[], changesFor: (item: WatchlistItem) => Partial<WatchlistItem>, text: string) {
    const before = new Map(chosen.map((i) => [i.id, i]))
    const all = chosen.map((i) => [i, changesFor(i)] as const)
    setItems((prev) => prev.map((i) => (before.has(i.id) ? { ...i, ...all.find(([c]) => c.id === i.id)![1] } : i)))
    try {
      for (const [item, changes] of all) {
        await updateItem(item.id, changes)
        if (changes.status === 'completed' && item.status !== 'completed') await recordCompletion(item.id).catch(() => {})
      }
      showToast({
        text,
        undo: async () => {
          for (const item of chosen) {
            await updateItem(item.id, pick(item, changesFor(item)))
          }
          setItems((prev) => prev.map((i) => before.get(i.id) ?? i))
        },
      })
    } catch (e) {
      setItems((prev) => prev.map((i) => before.get(i.id) ?? i))
      showToast({ text: `Opslaan mislukt: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  function bulkStatus(chosen: WatchlistItem[], status: WatchStatus) {
    const count = chosen.length
    return bulkChange(
      chosen,
      (item) => statusChanges(item, status),
      `${count} ${count === 1 ? 'titel' : 'titels'} op “${STATUS_LABELS[status]}” gezet`,
    )
  }

  function bulkTag(chosen: WatchlistItem[], tag: string, add: boolean) {
    const count = chosen.length
    return bulkChange(
      chosen,
      (item) => ({
        tags: add ? [...new Set([...(item.tags ?? []), tag])] : (item.tags ?? []).filter((t) => t !== tag),
      }),
      `Label “${tag}” ${add ? 'toegevoegd aan' : 'verwijderd van'} ${count} ${count === 1 ? 'titel' : 'titels'}`,
    )
  }

  async function bulkDelete(chosen: WatchlistItem[]) {
    const count = chosen.length
    try {
      const deleted = await deleteItems(chosen)
      const ids = new Set(chosen.map((i) => i.id))
      setItems((prev) => prev.filter((i) => !ids.has(i.id)))
      setSelected(new Set())
      showToast({ text: `${count} ${count === 1 ? 'titel' : 'titels'} verwijderd`, undo: () => restoreItems(deleted) }, 10000)
    } catch (e) {
      showToast({ text: `Verwijderen mislukt: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const visible = useMemo(() => {
    const needle = text.trim().toLocaleLowerCase('nl')
    return items
      .filter(
        (i) =>
          (typeFilter === 'all' || i.media_type === typeFilter) &&
          (statusFilter === 'all' || i.status === statusFilter) &&
          (tagFilter === 'all' || (i.tags ?? []).includes(tagFilter)) &&
          (genreFilter === 'all' || (i.genres ?? []).includes(genreFilter)) &&
          (!needle || `${i.title} ${i.original_title ?? ''}`.toLocaleLowerCase('nl').includes(needle)),
      )
      .sort(SORTS[sort].compare)
  }, [items, typeFilter, statusFilter, tagFilter, genreFilter, sort, text])

  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags ?? []))].sort(), [items])
  const allGenres = useMemo(
    () => [...new Set(items.flatMap((i) => i.genres ?? []))].sort((a, b) => a.localeCompare(b, 'nl')),
    [items],
  )

  const filtered = visible.length !== items.length
  // Soort, status en sorteren staan er altijd; genres en labels alleen als je die hebt
  const selectCount = 3 + (allGenres.length ? 1 : 0) + (allTags.length ? 1 : 0)

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mijn lijst</h1>
          <p className="text-sm text-muted">
            {filtered ? `${visible.length} van ` : ''}
            {items.length} {items.length === 1 ? 'titel' : 'titels'}
          </p>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => (selected ? setSelected(null) : setSelected(new Set()))}
              aria-pressed={selected !== null}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                selected ? 'border-accent bg-accent text-white' : 'border-line text-muted hover:text-fg'
              }`}
            >
              {selected ? 'Klaar' : 'Selecteren'}
            </button>
            <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Weergave">
              {(
                [
                  ['grid', 'Posters', GridIcon],
                  ['list', 'Lijst', RowsIcon],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => changeView(key)}
                  aria-pressed={view === key}
                  aria-label={label}
                  title={label}
                  className={`rounded px-2 py-1 transition ${view === key ? 'bg-panel-hover text-fg' : 'text-muted hover:text-fg'}`}
                >
                  <Icon />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <ContinueWatching items={inProgress} watched={watched} onMarkNext={markNext} />
      <Upcoming items={items} />
      <Reminders items={items} onChange={changeReminder} />

      {items.length > 0 && (
        <div className={`grid grid-cols-2 gap-2 lg:flex ${FILTER_COLUMNS[selectCount]}`}>
          <input
            type="search"
            value={text}
            onChange={(e) => setParam('zoek', e.target.value, '')}
            placeholder="Zoek in je lijst…"
            className="col-span-full min-w-0 rounded-md border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent lg:flex-1"
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
          {allGenres.length > 0 && (
            <Select
              value={genreFilter}
              onChange={(v) => setParam('genre', v, 'all')}
              options={[['all', 'Alle genres'], ...allGenres.map((g): [string, string] => [g, g])]}
            />
          )}
          {allTags.length > 0 && (
            <Select
              value={tagFilter}
              onChange={(v) => setParam('label', v, 'all')}
              options={[['all', 'Alle labels'], ...allTags.map((t): [string, string] => [t, t])]}
            />
          )}
          <Select
            value={sort}
            onChange={(v) => setParam('sorteer', v, defaultSort)}
            options={Object.entries(SORTS).map(([key, { label }]) => [key, label])}
            className={selectCount % 2 ? 'col-span-2 sm:col-span-1' : ''}
          />
        </div>
      )}

      {selected && (
        <BulkBar
          items={items.filter((i) => selected.has(i.id))}
          allTags={allTags}
          allSelected={visible.length > 0 && visible.every((i) => selected.has(i.id))}
          onSelectAll={(all) => setSelected(all ? new Set(visible.map((i) => i.id)) : new Set())}
          onStatus={bulkStatus}
          onTag={bulkTag}
          onDelete={bulkDelete}
        />
      )}

      {loading && <p className="text-muted">Laden…</p>}
      {error && <p className="text-bad">Kon je lijst niet laden: {error}</p>}

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

      {visible.length > 0 && view === 'grid' && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((item) => (
            <li key={item.id}>
              <ItemLink item={item} selected={selected} onToggle={toggleSelected} className="block h-full overflow-hidden rounded-lg border bg-panel transition">
                <div className="relative aspect-[2/3] bg-panel-hover">
                  {item.poster_url && (
                    <img src={item.poster_url} alt="" loading="lazy" className="size-full object-cover" />
                  )}
                  {selected ? (
                    <SelectMark checked={selected.has(item.id)} className="absolute top-2 left-2" />
                  ) : (
                    <QuickTick item={item} watched={watched.get(item.id)} onTick={() => markNext(item)} />
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{displayTitle(item)}</p>
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
                    <StatusLabel item={item} />
                    {item.rating && <span className="font-semibold text-star">★ {formatRating(item.rating)}</span>}
                  </div>
                </div>
              </ItemLink>
            </li>
          ))}
        </ul>
      )}

      {visible.length > 0 && view === 'list' && (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
          {visible.map((item) => {
            const seen = watched.get(item.id)
            const total = totalEpisodes(item.seasons) ?? 0
            return (
              <li key={item.id}>
                <ItemLink item={item} selected={selected} onToggle={toggleSelected} className="flex items-center gap-3 border-0 px-3 py-2">
                  {selected && <SelectMark checked={selected.has(item.id)} />}
                  <div className="aspect-[2/3] w-10 shrink-0 overflow-hidden rounded bg-panel-hover">
                    {item.poster_url && <img src={item.poster_url} alt="" loading="lazy" className="size-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{displayTitle(item)}</p>
                    <p className="truncate text-xs text-muted">
                      {item.status === 'plan_to_watch' && item.priority && (
                        <span
                          className={`mr-1.5 inline-block size-2 rounded-full align-middle ${PRIORITY_DOT[item.priority]}`}
                          title={`Prioriteit: ${PRIORITY_LABELS[item.priority]}`}
                        />
                      )}
                      {[
                        STATUS_LABELS[item.status],
                        hasEpisodes(item) && seen && total > 0 ? `${countWatched(item.seasons, seen)}/${total}` : null,
                        MEDIA_LABELS[item.media_type],
                        item.year,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {!selected && (
                    <QuickTick item={item} watched={seen} onTick={() => markNext(item)} inline />
                  )}
                  <span className="w-10 shrink-0 text-right text-sm font-semibold text-star tabular-nums">
                    {item.rating ? `★ ${formatRating(item.rating)}` : ''}
                  </span>
                </ItemLink>
              </li>
            )
          })}
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

// Ronde knop op de poster: met één tik de volgende aflevering afvinken, zonder de titel te openen
function QuickTick({
  item,
  watched,
  onTick,
  inline = false,
}: {
  item: WatchlistItem
  watched: Set<string> | undefined
  onTick: () => void
  inline?: boolean
}) {
  if (item.status !== 'watching' || !hasEpisodes(item) || !watched) return null
  const next = nextEpisode(item.seasons, watched)
  if (!next || !isAired(item, next)) return null
  return (
    <button
      onClick={(e) => {
        // De kaart is een link; de tik is alleen voor de knop
        e.preventDefault()
        e.stopPropagation()
        onTick()
      }}
      aria-label={`${episodeLabel(item, next)} van ${displayTitle(item)} als gekeken markeren`}
      className={`flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 text-xs font-semibold text-white active:scale-95 ${
        inline ? 'py-1.5' : 'py-2 absolute right-2 bottom-2 shadow-lg ring-2 ring-surface/60'
      }`}
    >
      ✓ {episodeLabel(item, next)}
    </button>
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

// Een titel in de lijst: opent de titel, of selecteert hem als je aan het selecteren bent
function ItemLink({
  item,
  selected,
  onToggle,
  className,
  children,
}: {
  item: WatchlistItem
  selected: Set<string> | null
  onToggle: (id: string) => void
  className: string
  children: ReactNode
}) {
  const isSelected = selected?.has(item.id) ?? false
  if (selected) {
    return (
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        aria-pressed={isSelected}
        className={`w-full text-left ${className} ${isSelected ? 'border-accent ring-2 ring-accent/60' : 'border-line'}`}
      >
        {children}
      </button>
    )
  }
  return (
    <Link to={`/titel/${item.id}`} className={`${className} border-line hover:border-accent/60 hover:bg-panel-hover/40`}>
      {children}
    </Link>
  )
}

function SelectMark({ checked, className = '' }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
        checked ? 'border-accent bg-accent text-white' : 'border-white/80 bg-black/30 text-transparent'
      } ${className}`}
    >
      ✓
    </span>
  )
}

function StatusLabel({ item }: { item: WatchlistItem }) {
  return (
    <span className="flex items-center gap-1.5 text-muted">
      {item.status === 'plan_to_watch' && item.priority && (
        <span className={`size-2 rounded-full ${PRIORITY_DOT[item.priority]}`} title={`Prioriteit: ${PRIORITY_LABELS[item.priority]}`} />
      )}
      {STATUS_LABELS[item.status]}
    </span>
  )
}

// De oude waarden van precies de velden die we wijzigden, om ongedaan te maken
function pick(item: WatchlistItem, changes: Partial<WatchlistItem>): Partial<WatchlistItem> {
  return Object.fromEntries(Object.keys(changes).map((key) => [key, item[key as keyof WatchlistItem]]))
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </svg>
  )
}

function RowsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  )
}
