import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AddDialog from '../components/AddDialog'
import { searchJikan, searchTmdb, type CatalogResult } from '../lib/catalog'
import { supabase } from '../lib/supabase'
import { MEDIA_LABELS, type WatchlistItem } from '../lib/types'

type Catalog = 'tmdb' | 'anime'

const CATALOGS: { key: Catalog; label: string }[] = [
  { key: 'tmdb', label: 'Films & series' },
  { key: 'anime', label: 'Anime' },
]

const keyOf = (r: { source: string; media_type: string; external_id: string }) =>
  `${r.source}:${r.media_type}:${r.external_id}`

export default function Search() {
  const [params, setParams] = useSearchParams()
  const catalog: Catalog = params.get('bron') === 'anime' ? 'anime' : 'tmdb'
  const query = params.get('q') ?? ''

  const [input, setInput] = useState(query)
  const [results, setResults] = useState<CatalogResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [owned, setOwned] = useState<Map<string, string>>(new Map())
  const [adding, setAdding] = useState<CatalogResult | null>(null)

  // Welke titels staan al in de lijst? Dan tonen we een link in plaats van "Toevoegen".
  useEffect(() => {
    supabase
      .from('watchlist_items')
      .select('id, source, media_type, external_id')
      .then(({ data }) => setOwned(new Map((data ?? []).map((i) => [keyOf(i), i.id as string]))))
  }, [])

  // Pas zoeken als je even stopt met typen
  useEffect(() => {
    const timer = setTimeout(() => {
      if (input.trim() !== query) {
        const next = new URLSearchParams(params)
        if (input.trim()) next.set('q', input.trim())
        else next.delete('q')
        setParams(next, { replace: true })
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [input, query, params, setParams])

  useEffect(() => {
    if (!query) {
      setResults([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(catalog === 'anime' ? searchJikan(query) : searchTmdb(query))
      .then((r) => !cancelled && setResults(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [query, catalog])

  function switchCatalog(key: Catalog) {
    const next = new URLSearchParams(params)
    if (key === 'anime') next.set('bron', 'anime')
    else next.delete('bron')
    setParams(next, { replace: true })
  }

  function handleAdded(item: WatchlistItem) {
    setOwned((prev) => new Map(prev).set(keyOf(item), item.id))
    setAdding(null)
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Zoeken</h1>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex rounded-lg border border-line bg-panel p-1">
          {CATALOGS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => switchCatalog(key)}
              className={`flex-1 rounded-md px-4 py-1.5 text-sm whitespace-nowrap transition ${
                catalog === key ? 'bg-accent text-white' : 'text-muted hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={catalog === 'anime' ? 'Zoek een anime…' : 'Zoek een film of serie…'}
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-4 py-2.5 outline-none focus:border-accent"
        />
      </div>

      {loading && <p className="text-muted">Zoeken…</p>}
      {error && <p className="text-red-400">Zoeken mislukt: {error}</p>}
      {!loading && !error && query && results.length === 0 && (
        <p className="text-muted">Niets gevonden voor “{query}”.</p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {results.map((r) => {
          const ownedId = owned.get(keyOf(r))
          return (
            <li key={keyOf(r)} className="flex gap-3 rounded-lg border border-line bg-panel p-3">
              <div className="aspect-[2/3] w-16 shrink-0 overflow-hidden rounded bg-panel-hover sm:w-20">
                {r.poster_url && <img src={r.poster_url} alt="" loading="lazy" className="size-full object-cover" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="font-medium leading-snug">{r.title}</p>
                <p className="text-xs text-muted">
                  {[r.subtype ?? MEDIA_LABELS[r.media_type], r.year, r.total_episodes && `${r.total_episodes} afl.`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {r.original_title && <p className="truncate text-xs text-muted">{r.original_title}</p>}
                {r.overview && <p className="mt-1 line-clamp-2 text-sm text-muted">{r.overview}</p>}
                <div className="mt-auto pt-2">
                  {ownedId ? (
                    <Link to={`/titel/${ownedId}`} className="text-sm text-emerald-400 hover:underline">
                      ✓ In je lijst
                    </Link>
                  ) : (
                    <button
                      onClick={() => setAdding(r)}
                      className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
                    >
                      + Toevoegen
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {adding && <AddDialog result={adding} onClose={() => setAdding(null)} onAdded={handleAdded} />}
    </div>
  )
}
