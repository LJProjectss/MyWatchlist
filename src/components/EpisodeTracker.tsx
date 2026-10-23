import { useEffect, useRef, useState } from 'react'
import { showToast } from '../lib/toast'
import {
  countWatched,
  describeNextAir,
  epKey,
  episodeLabel,
  fetchEpisodes,
  isAired,
  nextEpisode,
  setEpisodesWatched,
  statusAfterProgress,
  type EpisodeInfo,
  type EpisodeRef,
} from '../lib/episodes'
import { totalEpisodes } from '../lib/catalog'
import { formatRating, type EpisodeReview, type SeasonInfo, type WatchlistItem } from '../lib/types'
import { averageRating } from '../lib/reviews'
import ProgressBar from './ProgressBar'

export default function EpisodeTracker({
  item,
  watched,
  onWatchedChange,
  onItemChange,
  onRateSeason,
  reviews,
  onReviewChange,
  onSeasonNote,
}: {
  item: WatchlistItem
  watched: Set<string>
  onWatchedChange: (watched: Set<string>) => void
  onItemChange: (changes: Partial<WatchlistItem>) => void
  onRateSeason?: (seasonNumber: number, rating: number | null) => void
  reviews: Map<string, EpisodeReview>
  onReviewChange: (ref: EpisodeRef, rating: number | null, note: string | null) => void
  onSeasonNote: (seasonNumber: number, note: string | null) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const seasons = item.seasons ?? []
  const total = totalEpisodes(item.seasons) ?? 0
  const count = countWatched(item.seasons, watched)
  const next = nextEpisode(item.seasons, watched)
  const nextAired = next !== null && isAired(item, next)
  const upcoming = describeNextAir(item)

  // Altijd de nieuwste voortgang gebruiken, ook als er later via een melding nog iets wordt afgevinkt
  const latest = useRef({ watched, item })
  useEffect(() => {
    latest.current = { watched, item }
  })

  // Eerst lokaal bijwerken zodat afvinken direct voelt; bij een fout terugdraaien
  async function mark(episodes: EpisodeRef[], value: boolean) {
    const { watched, item } = latest.current
    const previous = watched
    const updated = new Set(watched)
    for (const e of episodes) {
      const key = epKey(e.season_number, e.episode_number)
      if (value) updated.add(key)
      else updated.delete(key)
    }
    latest.current = { watched: updated, item }
    onWatchedChange(updated)
    setError(null)
    try {
      await setEpisodesWatched(item, episodes, value)
      const status = statusAfterProgress(item, countWatched(item.seasons, updated))
      if (status !== item.status) onItemChange({ status })
    } catch (e) {
      latest.current = { watched: previous, item }
      onWatchedChange(previous)
      setError(`Opslaan mislukt: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Eerdere, al uitgezonden afleveringen die je nog niet hebt afgevinkt
  function unwatchedBefore(ref: EpisodeRef, seen: Set<string>) {
    return allEpisodes(seasons).filter(
      (e) =>
        (e.season_number < ref.season_number ||
          (e.season_number === ref.season_number && e.episode_number < ref.episode_number)) &&
        !seen.has(epKey(e.season_number, e.episode_number)) &&
        isAired(item, e),
    )
  }

  // Alles tot en met deze aflevering als gekeken markeren
  function markUpTo(ref: EpisodeRef) {
    return mark([...unwatchedBefore(ref, latest.current.watched), ref], true)
  }

  // Eén aflevering afvinken; staan er eerdere nog open, dan bieden we aan die ook af te vinken
  async function tick(episodes: EpisodeRef[], value: boolean) {
    await mark(episodes, value)
    if (!value || episodes.length !== 1) return
    const earlier = unwatchedBefore(episodes[0], latest.current.watched)
    if (earlier.length === 0) return
    showToast(
      {
        text: `Ook ${earlier.length === 1 ? 'de vorige aflevering' : `de ${earlier.length} eerdere afleveringen`} afvinken?`,
        actionLabel: 'Ja, afvinken',
        undo: () => mark(unwatchedBefore(episodes[0], latest.current.watched), true),
      },
      8000,
    )
  }

  if (seasons.length === 0) {
    return <p className="text-sm text-muted">Er zijn nog geen afleveringen bekend voor deze titel.</p>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-line bg-panel p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-medium">
            {count} van {total} afleveringen gekeken
          </p>
          <p className="text-sm text-muted">{total ? Math.round((count / total) * 100) : 0}%</p>
        </div>
        <ProgressBar value={count} max={total} />
        <div className="flex flex-wrap gap-2 pt-1">
          {nextAired ? (
            <button
              onClick={() => mark([next], true)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              ✓ {episodeLabel(item, next)} gekeken
            </button>
          ) : (
            <p className="text-sm text-good">Je bent helemaal bij!</p>
          )}
          {upcoming && <p className="w-full text-sm text-muted">Volgende uitzending: {upcoming}</p>}
          {nextAired && count === 0 && total > 1 && (
            <button
              onClick={() => mark(allEpisodes(seasons).filter((e) => isAired(item, e)), true)}
              className="rounded-md border border-line px-4 py-2 text-sm text-muted hover:text-fg"
            >
              Alles al gezien
            </button>
          )}
          {nextAired && total > 1 && <UpTo item={item} seasons={seasons} next={next} onMark={markUpTo} />}
        </div>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}

      <ul className="space-y-2">
        {seasons.map((season) => (
          <SeasonRow
            key={season.season_number}
            item={item}
            season={season}
            watched={watched}
            // Het seizoen waar je nu zit staat standaard open
            defaultOpen={seasons.length === 1 || next?.season_number === season.season_number}
            onMark={tick}
            rating={item.season_ratings?.[season.season_number] ?? null}
            onRate={onRateSeason && ((value) => onRateSeason(season.season_number, value))}
            reviews={reviews}
            onReviewChange={onReviewChange}
            note={item.season_notes?.[season.season_number] ?? null}
            onNote={(note) => onSeasonNote(season.season_number, note)}
          />
        ))}
      </ul>
    </div>
  )
}

function SeasonRow({
  item,
  season,
  watched,
  defaultOpen,
  onMark,
  rating,
  onRate,
  reviews,
  onReviewChange,
  note,
  onNote,
}: {
  item: WatchlistItem
  season: SeasonInfo
  watched: Set<string>
  defaultOpen: boolean
  onMark: (episodes: EpisodeRef[], value: boolean) => void
  rating: number | null
  onRate?: (rating: number | null) => void
  reviews: Map<string, EpisodeReview>
  onReviewChange: (ref: EpisodeRef, rating: number | null, note: string | null) => void
  note: string | null
  onNote: (note: string | null) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [editing, setEditing] = useState<number | null>(null)
  const seasonReviews = [...reviews.values()].filter((r) => r.season_number === season.season_number)
  const episodeAverage = averageRating(seasonReviews)
  const [episodes, setEpisodes] = useState<EpisodeInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const all = allEpisodes([season])
  const seen = all.filter((e) => watched.has(epKey(e.season_number, e.episode_number))).length
  const complete = seen === season.episode_count

  useEffect(() => {
    if (!open || episodes) return
    let cancelled = false
    fetchEpisodes(item, season)
      .then((list) => !cancelled && setEpisodes(list))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [open, episodes, item, season])

  // Zonder afleveringsnamen (bijv. bij een fout) tonen we gewoon de nummers
  const list: EpisodeInfo[] =
    episodes ?? all.map((e) => ({ episode_number: e.episode_number, name: null, air_date: null }))

  return (
    <li className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className={`text-muted transition ${open ? 'rotate-90' : ''}`}>›</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{season.name}</span>
            <span className="mt-1.5 flex items-center gap-2">
              <ProgressBar value={seen} max={season.episode_count} className="max-w-40" />
              <span className="text-xs text-muted whitespace-nowrap">
                {seen}/{season.episode_count}
                {episodeAverage !== null && (
                  <span title="Gemiddeld cijfer van de afleveringen"> · ★ {formatRating(episodeAverage)}</span>
                )}
              </span>
            </span>
          </span>
        </button>
        {onRate && (
          <select
            value={rating ?? ''}
            onChange={(e) => onRate(e.target.value ? Number(e.target.value) : null)}
            aria-label={`Cijfer voor ${season.name}`}
            className={`shrink-0 rounded-md border bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent ${
              rating ? 'border-star/60 text-star' : 'border-line text-muted'
            }`}
          >
            <option value="">★ –</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                ★ {n}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => onMark(all, !complete)}
          className={`shrink-0 rounded-md border px-3 py-1.5 text-xs transition ${
            complete
              ? 'border-good/50 text-good hover:border-bad/60 hover:text-bad'
              : 'border-line text-muted hover:text-fg'
          }`}
        >
          {complete ? '✓ Seizoen gezien' : 'Heel seizoen'}
        </button>
      </div>

      {open && (
        <div className="border-t border-line">
          {error && <p className="px-4 pt-3 text-xs text-muted">Afleveringsnamen konden niet worden geladen.</p>}
          <SeasonNote note={note} onSave={onNote} />
          {!episodes && !error && <p className="px-4 py-3 text-sm text-muted">Afleveringen laden…</p>}
          <ul className="divide-y divide-line">
            {list.map((ep) => {
              const ref = { season_number: season.season_number, episode_number: ep.episode_number }
              const isWatched = watched.has(epKey(ref.season_number, ref.episode_number))
              const upcoming = (ep.air_date !== null && ep.air_date > TODAY) || !isAired(item, ref)
              const review = reviews.get(epKey(ref.season_number, ref.episode_number))
              const isEditing = editing === ep.episode_number
              return (
                <li key={ep.episode_number}>
                  <div className="flex items-center hover:bg-panel-hover">
                    <label
                      className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2.5 pl-4 ${upcoming ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isWatched}
                        onChange={() => onMark([ref], !isWatched)}
                        className="size-5 shrink-0 accent-accent"
                      />
                      <span className="w-8 shrink-0 text-sm text-muted tabular-nums">{ep.episode_number}</span>
                      <span className={`min-w-0 flex-1 truncate text-sm ${isWatched ? 'text-muted' : ''}`}>
                        {ep.name ?? `Aflevering ${ep.episode_number}`}
                      </span>
                      {ep.air_date && (
                        <span className="hidden shrink-0 text-xs text-muted sm:block">
                          {upcoming ? 'Verwacht ' : ''}
                          {formatDate(ep.air_date)}
                        </span>
                      )}
                    </label>
                    <button
                      onClick={() => setEditing(isEditing ? null : ep.episode_number)}
                      aria-expanded={isEditing}
                      aria-label={`Cijfer en notitie voor aflevering ${ep.episode_number}`}
                      className={`shrink-0 px-4 py-2.5 text-xs tabular-nums ${
                        review ? 'text-star' : 'text-muted/60 hover:text-fg'
                      }`}
                    >
                      {review?.rating ? `★ ${review.rating}` : ''}
                      {review?.note ? ' ✎' : ''}
                      {!review && '☆'}
                    </button>
                  </div>
                  {isEditing && (
                    <EpisodeReviewEditor
                      review={review ?? null}
                      onSave={(rating, text) => onReviewChange(ref, rating, text)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </li>
  )
}

// Cijfer en notitie bij één aflevering; wordt meteen opgeslagen
function EpisodeReviewEditor({
  review,
  onSave,
}: {
  review: EpisodeReview | null
  onSave: (rating: number | null, note: string | null) => void
}) {
  const [note, setNote] = useState(review?.note ?? '')
  const rating = review?.rating ?? null
  return (
    <div className="flex flex-col gap-2 bg-surface/60 px-4 py-3 sm:flex-row sm:items-start">
      <select
        value={rating ?? ''}
        onChange={(e) => onSave(e.target.value ? Number(e.target.value) : null, note.trim() || null)}
        aria-label="Cijfer voor deze aflevering"
        className="w-fit rounded-md border border-line bg-panel px-2 py-1.5 text-sm outline-none focus:border-accent"
      >
        <option value="">★ Geen cijfer</option>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            ★ {n}
          </option>
        ))}
      </select>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note.trim() !== (review?.note ?? '') && onSave(rating, note.trim() || null)}
        rows={2}
        placeholder="Notitie bij deze aflevering"
        className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
    </div>
  )
}

function SeasonNote({ note, onSave }: { note: string | null; onSave: (note: string | null) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note ?? '')
  if (!editing) {
    return (
      <button
        onClick={() => {
          setText(note ?? '')
          setEditing(true)
        }}
        className="block w-full px-4 pt-3 text-left text-sm"
      >
        {note ? (
          <span className="block whitespace-pre-line text-muted">
            {note} <span className="text-xs text-accent-hover">Bewerken</span>
          </span>
        ) : (
          <span className="text-xs text-muted hover:text-fg">+ Notitie bij dit seizoen</span>
        )}
      </button>
    )
  }
  return (
    <div className="px-4 pt-3">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setEditing(false)
          if (text.trim() !== (note ?? '')) onSave(text.trim() || null)
        }}
        rows={2}
        placeholder="Wat vond je van dit seizoen?"
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </div>
  )
}

// "Tot hier gekeken": in één keer bijwerken tot een bepaalde aflevering, handig als je halverwege instapt
function UpTo({
  item,
  seasons,
  next,
  onMark,
}: {
  item: WatchlistItem
  seasons: SeasonInfo[]
  next: EpisodeRef
  onMark: (ref: EpisodeRef) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [season, setSeason] = useState(next.season_number)
  const [episode, setEpisode] = useState(String(next.episode_number))
  const max = seasons.find((s) => s.season_number === season)?.episode_count ?? 1
  const number = Math.min(Math.max(1, Number(episode) || 1), max)
  const ref = { season_number: season, episode_number: number }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-line px-4 py-2 text-sm text-muted hover:text-fg"
      >
        Tot hier gekeken…
      </button>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!isAired(item, ref)) return
        void onMark(ref).then(() => setOpen(false))
      }}
      className="flex w-full flex-wrap items-center gap-2 rounded-md border border-line bg-surface p-2 text-sm"
    >
      <span className="text-muted">Gekeken t/m</span>
      {seasons.length > 1 && (
        <select
          value={season}
          onChange={(e) => setSeason(Number(e.target.value))}
          aria-label="Seizoen"
          className="rounded-md border border-line bg-panel px-2 py-1.5 outline-none focus:border-accent"
        >
          {seasons.map((s) => (
            <option key={s.season_number} value={s.season_number}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-1.5">
        <span className="text-muted">afl.</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          value={episode}
          onChange={(e) => setEpisode(e.target.value)}
          aria-label="Aflevering"
          className="w-20 rounded-md border border-line bg-panel px-2 py-1.5 tabular-nums outline-none focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={!isAired(item, ref)}
        className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        Afvinken
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-1.5 text-muted hover:text-fg">
        Annuleren
      </button>
      {!isAired(item, ref) && <span className="w-full text-xs text-muted">Die aflevering is nog niet uitgezonden.</span>}
    </form>
  )
}

const TODAY = new Date().toISOString().slice(0, 10)

function allEpisodes(seasons: SeasonInfo[]): EpisodeRef[] {
  return seasons.flatMap((s) =>
    Array.from({ length: s.episode_count }, (_, i) => ({ season_number: s.season_number, episode_number: i + 1 })),
  )
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}
