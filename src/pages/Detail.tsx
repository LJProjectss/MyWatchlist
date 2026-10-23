import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import EpisodeTracker from '../components/EpisodeTracker'
import RatingPicker from '../components/RatingPicker'
import PriorityPicker from '../components/PriorityPicker'
import StatusPicker from '../components/StatusPicker'
import TagEditor from '../components/TagEditor'
import WatchHistory from '../components/WatchHistory'
import WhereToWatch from '../components/WhereToWatch'
import Trailer from '../components/Trailer'
import PauseInfo from '../components/PauseInfo'
import { PAUSED, statusChanges } from '../lib/reminders'
import Credits from '../components/Credits'
import Franchise from '../components/Franchise'
import { externalLinks } from '../lib/catalog'
import { hasEpisodes, loadWatched, refreshShowInfo } from '../lib/episodes'
import { selectAll, supabase } from '../lib/supabase'
import { isNetworkError, syncPending, updateItem } from '../lib/offline'
import { averageSeasonRating, formatRating, MEDIA_LABELS, type WatchHistoryEntry, type WatchlistItem } from '../lib/types'
import { loadHistory, recordCompletion } from '../lib/history'
import { loadReviews, saveReview } from '../lib/reviews'
import type { EpisodeRef } from '../lib/episodes'
import { epKey } from '../lib/episodes'
import type { EpisodeReview } from '../lib/types'
import { displayTitle, secondaryTitle } from '../lib/titles'
import { deleteItems, restoreItems } from '../lib/trash'
import { showToast } from '../lib/toast'
import {
  cacheItemChanges,
  cacheItemWatched,
  getCachedItem,
  getCachedItems,
  getCachedWatched,
} from '../lib/cache'

export default function Detail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Uit de onthouden lijst, zodat de pagina meteen verschijnt; daarna verversen we op de achtergrond
  const [item, setItem] = useState<WatchlistItem | null>(() => getCachedItem(id))
  const [loading, setLoading] = useState(() => getCachedItem(id) === null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState(() => getCachedItem(id)?.notes ?? '')
  // null zolang de voortgang laadt, zodat het juiste seizoen meteen openklapt
  const [history, setHistory] = useState<WatchHistoryEntry[]>([])
  const [allTags, setAllTags] = useState<string[]>(() =>
    [...new Set((getCachedItems() ?? []).flatMap((i) => i.tags ?? []))].sort(),
  )
  const [watched, setWatched] = useState<Set<string> | null>(() => (id && getCachedWatched()?.get(id)) || null)

  // Wijzigingen ook in de onthouden lijst zetten, zodat je lijst klopt als je teruggaat
  useEffect(() => {
    if (item) cacheItemChanges(item.id, item)
  }, [item])
  useEffect(() => {
    if (item && watched) cacheItemWatched(item.id, watched)
  }, [item, watched])

  async function refreshEpisodes(loaded: WatchlistItem) {
    // Offline: de onthouden voortgang gebruiken (inclusief wat je offline hebt afgevinkt)
    let seen = getCachedWatched()?.get(loaded.id) ?? new Set<string>()
    try {
      seen = (await loadWatched([loaded])).get(loaded.id) ?? new Set()
    } catch (e) {
      if (!isNetworkError(e)) setError(`Afleveringen laden mislukt: ${e instanceof Error ? e.message : String(e)}`)
    }
    setWatched(seen)
    // Nieuwe seizoenen, afleveringen en uitzenddata bijwerken; lukt dat niet, dan gebruiken we de opgeslagen gegevens
    const changes = await refreshShowInfo(loaded, seen).catch(() => null)
    if (changes) setItem((current) => (current ? { ...current, ...changes } : current))
  }

  const [reviews, setReviews] = useState<Map<string, EpisodeReview>>(new Map())

  useEffect(() => {
    if (id) loadHistory(id).then(setHistory).catch(() => {})
    if (id) loadReviews(id).then(setReviews).catch(() => {})
  }, [id])

  async function changeReview(ref: EpisodeRef, rating: number | null, note: string | null) {
    if (!item) return
    const key = epKey(ref.season_number, ref.episode_number)
    const previous = reviews
    const next = new Map(reviews)
    if (rating === null && !note) next.delete(key)
    else next.set(key, { ...ref, rating, note })
    setReviews(next)
    setError(null)
    try {
      await saveReview(item.id, ref, rating, note)
    } catch (e) {
      setReviews(previous)
      setError(`Opslaan mislukt: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function noteSeason(seasonNumber: number, note: string | null) {
    if (!item) return
    const next = { ...(item.season_notes ?? {}) }
    if (note) next[seasonNumber] = note
    else delete next[seasonNumber]
    update({ season_notes: Object.keys(next).length ? next : null })
  }

  // Labels die je al eerder hebt gebruikt, als suggesties
  useEffect(() => {
    selectAll<{ tags: string[] | null }>('watchlist_items', 'id, tags')
      .then((data) => setAllTags([...new Set(data.flatMap((r) => r.tags ?? []))].sort()))
      .catch(() => {})
  }, [])

  useEffect(() => {
    void syncPending().finally(() =>
      supabase
        .from('watchlist_items')
        .select('*')
        .eq('id', id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            // Offline of storing: dan blijft de onthouden versie staan, ook met de afleveringen
            const cached = getCachedItem(id)
            if (!cached) setError(error.message)
            else if (hasEpisodes(cached)) setWatched((w) => w ?? getCachedWatched()?.get(cached.id) ?? new Set())
            setLoading(false)
            return
          }
          setItem(data as WatchlistItem | null)
          setNotes(data?.notes ?? '')
          setLoading(false)
          if (data && hasEpisodes(data)) refreshEpisodes(data as WatchlistItem)
        })
    )
  }, [id])

  // Wijzigingen direct opslaan; bij een fout de oude waarde terugzetten
  async function update(changes: Partial<WatchlistItem>) {
    if (!item) return
    setItem((current) => (current ? { ...current, ...changes } : current))
    setError(null)
    try {
      await updateItem(item.id, changes)
    } catch (e) {
      setItem((current) => (current ? { ...current, ...pick(item, changes) } : current))
      setError(`Opslaan mislukt: ${e instanceof Error ? e.message : String(e)}`)
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
    if (!item) return
    try {
      const deleted = await deleteItems([item])
      navigate('/', { replace: true })
      showToast({ text: `“${displayTitle(item)}” verwijderd`, undo: () => restoreItems(deleted) }, 10000)
    } catch (e) {
      setError(`Verwijderen mislukt: ${e instanceof Error ? e.message : String(e)}`)
    }
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
        {/* self-start: anders rekt de flex-rij het vak uit tot de hoogte van de kolom ernaast */}
        <div className="mx-auto w-40 shrink-0 self-center sm:sticky sm:top-20 sm:mx-0 sm:w-48 sm:self-start lg:w-56">
          {item.poster_url ? (
            <img src={item.poster_url} alt="" className="block h-auto w-full rounded-lg shadow-lg" />
          ) : (
            <div className="aspect-[2/3] w-full rounded-lg bg-panel-hover" />
          )}
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
            {(item.genres?.length || item.public_score) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                {item.public_score && (
                  <span className="mr-1 text-muted" title="Gemiddeld cijfer van alle kijkers">
                    {item.source === 'jikan' ? 'MyAnimeList' : 'TMDB'}{' '}
                    <span className="font-semibold text-fg">★ {formatRating(item.public_score)}</span>
                  </span>
                )}
                {item.genres?.map((genre) => (
                  <Link
                    key={genre}
                    to={`/?genre=${encodeURIComponent(genre)}`}
                    className="rounded-full border border-line px-2 py-0.5 text-muted hover:border-accent/60 hover:text-fg"
                  >
                    {genre}
                  </Link>
                ))}
              </div>
            )}
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
            <StatusPicker value={item.status} onChange={(status) => update(statusChanges(item, status))} />
          </section>

          {PAUSED.includes(item.status) && <PauseInfo key={item.status} item={item} onChange={update} />}

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

          <Trailer item={item} />

          <Credits item={item} />

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
              reviews={reviews}
              onReviewChange={changeReview}
              onSeasonNote={noteSeason}
            />
          ) : (
            <p className="text-sm text-muted">Laden…</p>
          )}
        </section>
      )}

      <Franchise item={item} />
    </div>
  )
}

// De oude waarden van precies de velden die we probeerden te wijzigen
function pick(item: WatchlistItem, changes: Partial<WatchlistItem>): Partial<WatchlistItem> {
  return Object.fromEntries(Object.keys(changes).map((key) => [key, item[key as keyof WatchlistItem]]))
}
