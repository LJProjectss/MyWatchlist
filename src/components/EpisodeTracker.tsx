import { useEffect, useState } from 'react'
import {
  countWatched,
  epKey,
  episodeLabel,
  fetchEpisodes,
  nextEpisode,
  setEpisodesWatched,
  statusAfterProgress,
  type EpisodeInfo,
  type EpisodeRef,
} from '../lib/episodes'
import { totalEpisodes } from '../lib/catalog'
import type { SeasonInfo, WatchlistItem } from '../lib/types'
import ProgressBar from './ProgressBar'

export default function EpisodeTracker({
  item,
  watched,
  onWatchedChange,
  onItemChange,
}: {
  item: WatchlistItem
  watched: Set<string>
  onWatchedChange: (watched: Set<string>) => void
  onItemChange: (changes: Partial<WatchlistItem>) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const seasons = item.seasons ?? []
  const total = totalEpisodes(item.seasons) ?? 0
  const count = countWatched(item.seasons, watched)
  const next = nextEpisode(item.seasons, watched)

  // Eerst lokaal bijwerken zodat afvinken direct voelt; bij een fout terugdraaien
  async function mark(episodes: EpisodeRef[], value: boolean) {
    const previous = watched
    const updated = new Set(watched)
    for (const e of episodes) {
      const key = epKey(e.season_number, e.episode_number)
      if (value) updated.add(key)
      else updated.delete(key)
    }
    onWatchedChange(updated)
    setError(null)
    try {
      await setEpisodesWatched(item.id, episodes, value)
      const status = statusAfterProgress(item, countWatched(item.seasons, updated))
      if (status !== item.status) onItemChange({ status })
    } catch (e) {
      onWatchedChange(previous)
      setError(`Opslaan mislukt: ${e instanceof Error ? e.message : String(e)}`)
    }
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
          {next ? (
            <button
              onClick={() => mark([next], true)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              ✓ {episodeLabel(item, next)} gekeken
            </button>
          ) : (
            <p className="text-sm text-emerald-400">Je bent helemaal bij!</p>
          )}
          {next && count === 0 && total > 1 && (
            <button
              onClick={() => mark(allEpisodes(seasons), true)}
              className="rounded-md border border-line px-4 py-2 text-sm text-muted hover:text-white"
            >
              Alles al gezien
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <ul className="space-y-2">
        {seasons.map((season) => (
          <SeasonRow
            key={season.season_number}
            item={item}
            season={season}
            watched={watched}
            // Het seizoen waar je nu zit staat standaard open
            defaultOpen={seasons.length === 1 || next?.season_number === season.season_number}
            onMark={mark}
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
}: {
  item: WatchlistItem
  season: SeasonInfo
  watched: Set<string>
  defaultOpen: boolean
  onMark: (episodes: EpisodeRef[], value: boolean) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
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
              </span>
            </span>
          </span>
        </button>
        <button
          onClick={() => onMark(all, !complete)}
          className={`shrink-0 rounded-md border px-3 py-1.5 text-xs transition ${
            complete
              ? 'border-emerald-500/50 text-emerald-400 hover:border-red-400/60 hover:text-red-400'
              : 'border-line text-muted hover:text-white'
          }`}
        >
          {complete ? '✓ Seizoen gezien' : 'Heel seizoen'}
        </button>
      </div>

      {open && (
        <div className="border-t border-line">
          {error && <p className="px-4 pt-3 text-xs text-muted">Afleveringsnamen konden niet worden geladen.</p>}
          {!episodes && !error && <p className="px-4 py-3 text-sm text-muted">Afleveringen laden…</p>}
          <ul className="divide-y divide-line">
            {list.map((ep) => {
              const ref = { season_number: season.season_number, episode_number: ep.episode_number }
              const isWatched = watched.has(epKey(ref.season_number, ref.episode_number))
              const upcoming = ep.air_date !== null && ep.air_date > TODAY
              return (
                <li key={ep.episode_number}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-panel-hover ${
                      upcoming ? 'opacity-50' : ''
                    }`}
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
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </li>
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
