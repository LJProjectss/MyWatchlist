import { Link } from 'react-router-dom'
import { totalEpisodes } from '../lib/catalog'
import { countWatched, describeNextAir, episodeLabel, isAired, nextEpisode } from '../lib/episodes'
import type { WatchlistItem } from '../lib/types'
import ProgressBar from './ProgressBar'
import { displayTitle } from '../lib/titles'

export default function ContinueWatching({
  items,
  watched,
  onMarkNext,
}: {
  items: WatchlistItem[]
  watched: Map<string, Set<string>>
  onMarkNext: (item: WatchlistItem) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Verder kijken</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const seen = watched.get(item.id) ?? new Set<string>()
          const next = nextEpisode(item.seasons, seen)
          const aired = next !== null && isAired(item, next)
          const count = countWatched(item.seasons, seen)
          const total = totalEpisodes(item.seasons) ?? 0
          return (
            <li key={item.id} className="flex gap-3 rounded-lg border border-line bg-panel p-3">
              <Link to={`/titel/${item.id}`} className="aspect-[2/3] w-14 shrink-0 overflow-hidden rounded bg-panel-hover">
                {item.poster_url && <img src={item.poster_url} alt="" loading="lazy" className="size-full object-cover" />}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Link to={`/titel/${item.id}`} className="truncate font-medium hover:underline">
                  {displayTitle(item)}
                </Link>
                <p className="text-xs text-muted">
                  {aired ? `Volgende: ${episodeLabel(item, next!)}` : 'Helemaal bij'} · {count}/{total}
                </p>
                <ProgressBar value={count} max={total} />
                {!aired && item.next_air && <p className="text-xs text-muted">Nieuw: {describeNextAir(item)}</p>}
                {aired && (
                  <button
                    onClick={() => onMarkNext(item)}
                    className="mt-auto self-start rounded-md bg-accent px-3 py-2 text-sm font-medium sm:py-1 sm:text-xs text-white hover:bg-accent-hover"
                  >
                    ✓ {episodeLabel(item, next!)} gekeken
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
