import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import EpisodeTracker from '../components/EpisodeTracker'
import RatingPicker from '../components/RatingPicker'
import StatusPicker from '../components/StatusPicker'
import { externalLinks, totalEpisodes } from '../lib/catalog'
import { fetchSeasons, hasEpisodes, loadWatched } from '../lib/episodes'
import { supabase } from '../lib/supabase'
import { averageSeasonRating, formatRating, MEDIA_LABELS, type WatchlistItem } from '../lib/types'

export default function Detail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState<WatchlistItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  // null zolang de voortgang laadt, zodat het juiste seizoen meteen openklapt
  const [watched, setWatched] = useState<Set<string> | null>(null)

  async function refreshEpisodes(loaded: WatchlistItem) {
    try {
      setWatched((await loadWatched([loaded])).get(loaded.id) ?? new Set())
    } catch (e) {
      setWatched(new Set())
      setError(`Afleveringen laden mislukt: ${e instanceof Error ? e.message : String(e)}`)
    }
    // Nieuwe seizoenen of afleveringen bijwerken; als de bron niet bereikbaar is, gebruiken we de opgeslagen indeling
    const seasons = await fetchSeasons(loaded).catch(() => null)
    if (seasons && JSON.stringify(seasons) !== JSON.stringify(loaded.seasons)) {
      const changes = { seasons, total_episodes: totalEpisodes(seasons) }
      setItem((current) => (current ? { ...current, ...changes } : current))
      await supabase.from('watchlist_items').update(changes).eq('id', loaded.id)
    }
  }

  useEffect(() => {
    supabase
      .from('watchlist_items')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setItem(data as WatchlistItem | null)
        setNotes(data?.notes ?? '')
        setLoading(false)
        if (data && hasEpisodes(data)) refreshEpisodes(data as WatchlistItem)
      })
  }, [id])

  // Wijzigingen direct opslaan; bij een fout de oude waarde terugzetten
  async function update(changes: Partial<WatchlistItem>) {
    if (!item) return
    setItem((current) => (current ? { ...current, ...changes } : current))
    setError(null)
    const { error } = await supabase.from('watchlist_items').update(changes).eq('id', item.id)
    if (error) {
      setItem((current) => (current ? { ...current, ...pick(item, changes) } : current))
      setError(`Opslaan mislukt: ${error.message}`)
    }
  }

  function rateSeason(seasonNumber: number, value: number | null) {
    if (!item) return
    const next = { ...(item.season_ratings ?? {}) }
    if (value === null) delete next[seasonNumber]
    else next[seasonNumber] = value
    const seasonRatings = Object.keys(next).length ? next : null
    update({ season_ratings: seasonRatings, rating: averageSeasonRating(seasonRatings) })
  }

  async function handleDelete() {
    if (!item || !confirm(`“${item.title}” uit je lijst verwijderen?`)) return
    const { error } = await supabase.from('watchlist_items').delete().eq('id', item.id)
    if (error) setError(`Verwijderen mislukt: ${error.message}`)
    else navigate('/', { replace: true })
  }

  if (loading) return <p className="text-muted">Laden…</p>
  if (!item)
    return (
      <div className="space-y-3">
        <p className="text-muted">{error ?? 'Deze titel staat niet (meer) in je lijst.'}</p>
        <Link to="/" className="text-accent-hover hover:underline">
          Terug naar je lijst
        </Link>
      </div>
    )

  // Cijfers per seizoen alleen bij series met meerdere seizoenen
  const canRateSeasons = item.media_type === 'tv' && (item.seasons?.length ?? 0) > 1
  const seasonRatingCount = Object.keys(item.season_ratings ?? {}).length

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-muted hover:text-white">
        ← Mijn lijst
      </Link>

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="mx-auto aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-lg bg-panel-hover sm:mx-0 sm:w-48 lg:w-56">
          {item.poster_url && <img src={item.poster_url} alt="" className="size-full object-cover" />}
        </div>

        <div className="min-w-0 flex-1 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{item.title}</h1>
            {item.original_title && <p className="text-muted">{item.original_title}</p>}
            <p className="mt-1 text-sm text-muted">
              {[MEDIA_LABELS[item.media_type], item.year, item.total_episodes && `${item.total_episodes} afleveringen`]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="mt-2 flex gap-3 text-sm">
              {externalLinks(item).map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="text-accent-hover hover:underline">
                  {l.label} ↗
                </a>
              ))}
            </div>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm text-muted">Status</h2>
            <StatusPicker value={item.status} onChange={(status) => update({ status })} />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm text-muted">Jouw cijfer</h2>
            {seasonRatingCount > 0 ? (
              <p>
                <span className="text-2xl font-semibold text-amber-400">★ {formatRating(item.rating!)}</span>
                <span className="ml-2 text-sm text-muted">
                  gemiddelde van {seasonRatingCount} {seasonRatingCount === 1 ? 'seizoen' : 'seizoenen'}
                </span>
              </p>
            ) : (
              <div className="max-w-xl space-y-2">
                <RatingPicker value={item.rating} onChange={(rating) => update({ rating })} />
                {canRateSeasons && (
                  <p className="text-xs text-muted">
                    Of geef hieronder per seizoen een cijfer; dan wordt dit het gemiddelde.
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm text-muted">Notities</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (item.notes ?? '') && update({ notes: notes || null })}
              rows={3}
              placeholder="Wat vond je ervan?"
              className="w-full max-w-xl rounded-md border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </section>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button onClick={handleDelete} className="text-sm text-red-400 hover:underline">
            Verwijderen uit mijn lijst
          </button>
        </div>
      </div>

      {hasEpisodes(item) && (
        <section className="space-y-3 border-t border-line pt-6">
          <h2 className="text-lg font-semibold">Afleveringen</h2>
          {watched ? (
            <EpisodeTracker
              item={item}
              watched={watched}
              onWatchedChange={setWatched}
              onItemChange={update}
              onRateSeason={canRateSeasons ? rateSeason : undefined}
            />
          ) : (
            <p className="text-sm text-muted">Laden…</p>
          )}
        </section>
      )}
    </div>
  )
}

// De oude waarden van precies de velden die we probeerden te wijzigen
function pick(item: WatchlistItem, changes: Partial<WatchlistItem>): Partial<WatchlistItem> {
  return Object.fromEntries(Object.keys(changes).map((key) => [key, item[key as keyof WatchlistItem]]))
}
