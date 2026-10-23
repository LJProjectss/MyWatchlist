import { useState } from 'react'
import { Link } from 'react-router-dom'
import { dueReminders, formatSince, monthsFromNow } from '../lib/reminders'
import { displayTitle } from '../lib/titles'
import type { WatchlistItem } from '../lib/types'

// Titels die je hebt gepauzeerd of gestopt en waarvan de herinnering is verlopen
export default function Reminders({
  items,
  onChange,
}: {
  items: WatchlistItem[]
  onChange: (item: WatchlistItem, changes: Partial<WatchlistItem>) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const due = dueReminders(items)
  if (due.length === 0) return null
  const shown = showAll ? due : due.slice(0, 3)
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Opnieuw proberen?</h2>
      <ul className="space-y-2">
        {shown.map((item) => (
          <li key={item.id} className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-3 sm:flex-row sm:items-center">
            <Link to={`/titel/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <div className="aspect-[2/3] w-10 shrink-0 self-start overflow-hidden rounded bg-panel-hover">
                {item.poster_url && <img src={item.poster_url} alt="" loading="lazy" className="size-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{displayTitle(item)}</p>
                <p className="text-xs text-muted">
                  {item.status === 'dropped' ? 'Gestopt' : 'Gepauzeerd'}
                  {item.paused_at && ` op ${formatSince(item.paused_at)}`}
                </p>
                {item.pause_reason && <p className="line-clamp-2 text-sm text-muted">“{item.pause_reason}”</p>}
              </div>
            </Link>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onChange(item, { status: 'watching', remind_at: null })}
                className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:text-sm text-white hover:bg-accent-hover"
              >
                Verder kijken
              </button>
              <button
                onClick={() => onChange(item, { remind_at: monthsFromNow(1) })}
                className="rounded-md border border-line px-2.5 py-1.5 text-xs text-muted sm:px-3 sm:text-sm hover:text-fg"
              >
                Over een maand
              </button>
              <button
                onClick={() => onChange(item, { remind_at: null })}
                className="rounded-md border border-line px-2.5 py-1.5 text-xs text-muted sm:px-3 sm:text-sm hover:text-fg"
              >
                Niet meer
              </button>
            </div>
          </li>
        ))}
      </ul>
      {shown.length < due.length && (
        <button onClick={() => setShowAll(true)} className="text-sm text-accent-hover hover:underline">
          Nog {due.length - shown.length} tonen
        </button>
      )}
    </section>
  )
}
