import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import EpisodeTracker from '../components/EpisodeTracker'
import RatingPicker from '../components/RatingPicker'
import PriorityPicker from '../components/PriorityPicker'
import StatusPicker from '../components/StatusPicker'
import TagEditor from '../components/TagEditor'
import WatchHistory from '../components/WatchHistory'
import WhereToWatch from '../components/WhereToWatch'
import { externalLinks } from '../lib/catalog'
import { hasEpisodes, loadWatched, refreshShowInfo } from '../lib/episodes'
import { supabase } from '../lib/supabase'
import { averageSeasonRating, formatRating, MEDIA_LABELS, type WatchHistoryEntry, type WatchlistItem } from '../lib/types'
import { loadHistory, recordCompletion } from '../lib/history'
import { displayTitle, secondaryTitle } from '../lib/titles'

export default function Detail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState<WatchlistItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  // null zolang de voortgang laadt, zodat het juiste seizoen meteen openklapt
  const [history, setHistory] = useState<WatchHistoryEntry[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [watched, setWatched] = useState<Set<string> | null>(null)

  async function refreshEpisodes(loaded: WatchlistItem) {
    let seen = new Set<string>()
    try {
      seen = (await loadWatched([loaded])).get(loaded.id) ?? new Set()
    } catch (e) {
      setError(`Afleveringen laden mislukt: ${e instanceof Error ? e.message : String(e)}`)
    }
    setWatched(seen)
    // Nieuwe seizoenen, afleveringen en uitzenddata bijwerken; lukt dat niet, dan gebruiken we de opgeslagen gegevens
    const changes = await refreshShowInfo(loaded, seen).catch(() => null)
    if (changes) setItem((current) => (current ? { ...current, ...changes } : current))
  }

  useEffect(() => {
    if (id) loadHistory(id).then(setHistory).catch(() => {})
  }, [id])

  // Labels die je al eerder hebt gebruikt, als suggesties
  useEffect(() => {
    supabase
      .from('watchlist_items')
      .select('tags')
      .then(({ data }) => setAllTags([...new Set((data ?? []).flatMap((r) => r.tags ?? []))].sort()))
  }, [])

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
      return
    }
    // Nieuwe kijkbeurt: voortgang van die beurt laden (leeg bij opnieuw beginnen)
    if (changes.current_watch !== undefined) {
      const updated = { ...item, ...changes }
      setWatched((await loadWatched([updated]).catch(() => new Map())).get(item.id) ?? new Set())
    }
    // Helemaal gezien: datum vastleggen in de kijkgeschiedenis
    if (changes.status === 'completed' && item.status !== 'completed') {
      await recordCompletion(item.id).catch(() => {})
      reloadHistory()
    }
  }

  function reloadHistory() {
    if (id) loadHistory(id).then(setHistory).catch(() => {})
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
    if (!item || !confirm(`“${displayTitle(item)}” uit je lijst verwijderen?`)) return
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
      <Link to="/" className="text-sm text-muted hover:text-fg">
        ← Mijn lijst
      </Link>

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="mx-auto aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-lg bg-panel-hover sm:mx-0 sm:w-48 lg:w-56">
          {item.poster_url && <img src={item.poster_url} alt="" className="size-full object-cover" />}
        </div>

        <div className="min-w-0 flex-1 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{displayTitle(item)}</h1>
            {secondaryTitle(item) && <p className="text-muted">{secondaryTitle(item)}</p>}
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

          {item.status === 'plan_to_watch' && (
            <section className="space-y-2">
              <h2 className="text-sm text-muted">Prioriteit</h2>
              <PriorityPicker value={item.priority} onChange={(priority) => update({ priority })} />
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-sm text-muted">Jouw cijfer</h2>
            {seasonRatingCount > 0 ? (
              <p>
                <span className="text-2xl font-semibold text-star">★ {formatRating(item.rating!)}</span>
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

          <section className="space-y-2">
            <h2 className="text-sm text-muted">Kijkgeschiedenis</h2>
            <WatchHistory
              item={item}
              history={history}
              watchedThisRound={watched?.size ?? 0}
              onHistoryChange={reloadHistory}
              onItemChange={update}
            />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm text-muted">Labels</h2>
            <TagEditor tags={item.tags ?? []} suggestions={allTags} onChange={(tags) => update({ tags })} />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm text-muted">Waar te kijken</h2>
            <WhereToWatch item={item} />
          </section>

          {error && <p className="text-sm text-bad">{error}</p>}

          <button onClick={handleDelete} className="text-sm text-bad hover:underline">
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
