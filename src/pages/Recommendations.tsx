import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AddDialog from '../components/AddDialog'
import type { CatalogResult } from '../lib/catalog'
import { loadRecommendations, type Recommendation } from '../lib/recommendations'
import { supabase } from '../lib/supabase'
import { MEDIA_LABELS, type WatchlistItem } from '../lib/types'
import { displayTitle } from '../lib/titles'

type Filter = 'all' | 'tmdb' | 'jikan'

const FILTERS: [Filter, string][] = [
  ['all', 'Alles'],
  ['tmdb', 'Films & series'],
  ['jikan', 'Anime'],
]

export default function Recommendations() {
  const [list, setList] = useState<Recommendation[] | null>(null)
  const [hasSeeds, setHasSeeds] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState<CatalogResult | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase
      .from('watchlist_items')
      .select('*')
      .then(async ({ data, error }) => {
        if (error) return setError(error.message)
        const items = data as WatchlistItem[]
        setHasSeeds(items.some((i) => i.rating !== null && i.rating >= 7))
        try {
          setList(await loadRecommendations(items))
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
        }
      })
  }, [])

  const visible = (list ?? []).filter((r) => filter === 'all' || r.result.source === filter)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Aanbevolen</h1>
        <p className="text-sm text-muted">Op basis van de titels die je een 7 of hoger gaf.</p>
      </div>

      <div className="flex w-fit rounded-lg border border-line bg-panel p-1">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition sm:px-4 ${
              filter === key ? 'bg-accent text-white' : 'text-muted hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-bad">Aanbevelingen laden mislukt: {error}</p>}
      {!error && !list && <p className="text-muted">Aanbevelingen zoeken…</p>}
      {list && !hasSeeds && (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <p className="font-medium">Nog geen aanbevelingen</p>
          <p className="mt-1 text-sm text-muted">Geef een paar titels een 7 of hoger, dan zoek ik wat erop lijkt.</p>
          <Link to="/" className="mt-4 inline-block text-sm text-accent-hover hover:underline">
            Naar je lijst
          </Link>
        </div>
      )}
      {list && hasSeeds && visible.length === 0 && <p className="text-muted">Geen aanbevelingen in deze categorie.</p>}

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {visible.map(({ result, because }) => {
          const key = `${result.source}:${result.media_type}:${result.external_id}`
          return (
            <li key={key} className="flex flex-col overflow-hidden rounded-lg border border-line bg-panel">
              <div className="aspect-[2/3] bg-panel-hover">
                {result.poster_url && (
                  <img src={result.poster_url} alt="" loading="lazy" className="size-full object-cover" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{displayTitle(result)}</p>
                <p className="text-xs text-muted">
                  {MEDIA_LABELS[result.media_type]}
                  {result.year ? ` · ${result.year}` : ''}
                </p>
                <p className="line-clamp-2 text-xs text-muted" title={because.join(', ')}>
                  Omdat je {because[0]} goed vond{because.length > 1 ? ` (+${because.length - 1})` : ''}
                </p>
                <div className="mt-auto pt-2">
                  {added.has(key) ? (
                    <span className="text-sm text-good">✓ Toegevoegd</span>
                  ) : (
                    <button
                      onClick={() => setAdding(result)}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
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

      {adding && (
        <AddDialog
          result={adding}
          initialStatus="plan_to_watch"
          onClose={() => setAdding(null)}
          onAdded={() => {
            setAdded((prev) => new Set(prev).add(`${adding.source}:${adding.media_type}:${adding.external_id}`))
            setAdding(null)
          }}
        />
      )}
    </div>
  )
}
