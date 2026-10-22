import { Link } from 'react-router-dom'
import { describeNextAir } from '../lib/episodes'
import type { WatchlistItem } from '../lib/types'

// Lopende series en anime die je volgt, met de eerstvolgende uitzending
export default function Upcoming({ items }: { items: WatchlistItem[] }) {
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = items
    .filter(
      (i) =>
        i.next_air &&
        ['watching', 'completed', 'on_hold'].includes(i.status) &&
        (i.next_air.air_date === null || i.next_air.air_date >= today),
    )
    // Met datum eerst, op volgorde; anime met alleen een vaste uitzenddag daarna
    .sort((a, b) => (a.next_air!.air_date ?? '9999').localeCompare(b.next_air!.air_date ?? '9999'))
    .slice(0, 8)

  if (upcoming.length === 0) return null
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Binnenkort</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
        {upcoming.map((item) => (
          <li key={item.id}>
            <Link
              to={`/titel/${item.id}`}
              className="flex flex-col gap-0.5 px-4 py-2.5 hover:bg-panel-hover sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
              <span className="text-xs text-muted sm:shrink-0 sm:text-right">{describeNextAir(item)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
