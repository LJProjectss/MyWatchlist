import { useState } from 'react'
import { addHistory, deleteHistory, formatDate, localDate } from '../lib/history'
import { hasEpisodes } from '../lib/episodes'
import type { WatchHistoryEntry, WatchlistItem } from '../lib/types'

export default function WatchHistory({
  item,
  history,
  watchedThisRound,
  onHistoryChange,
  onItemChange,
}: {
  item: WatchlistItem
  history: WatchHistoryEntry[]
  watchedThisRound: number
  onHistoryChange: () => void
  onItemChange: (changes: Partial<WatchlistItem>) => void
}) {
  const [date, setDate] = useState(localDate())
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSeries = hasEpisodes(item)
  const round = item.current_watch ?? 1

  async function run(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
      onHistoryChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="max-w-xl space-y-3">
      {history.length === 0 ? (
        <p className="text-sm text-muted">Nog geen datum vastgelegd.</p>
      ) : (
        <ul className="space-y-1">
          {history.map((entry, i) => (
            <li key={entry.id} className="group flex items-center gap-2 text-sm">
              <span className="text-good">✓</span>
              <span>
                {isSeries || history.length > 1 ? `${history.length - i}e keer gezien op ` : 'Gezien op '}
                {formatDate(entry.watched_on)}
              </span>
              <button
                onClick={() => run(() => deleteHistory(entry.id))}
                aria-label="Datum verwijderen"
                className="text-muted opacity-60 hover:text-bad group-hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {isSeries && round > 1 && (
        <p className="text-sm text-accent-hover">
          Je bent dit voor de {round}e keer aan het kijken. Je eerdere voortgang blijft bewaard.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {adding ? (
          <>
            <input
              type="date"
              value={date}
              max={localDate()}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-line bg-panel px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={() => run(async () => {
                await addHistory(item.id, date)
                setAdding(false)
              })}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Opslaan
            </button>
            <button onClick={() => setAdding(false)} className="px-2 py-1.5 text-sm text-muted hover:text-fg">
              Annuleren
            </button>
          </>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
          >
            + Datum gekeken toevoegen
          </button>
        )}

        {isSeries && !adding && (
          <button
            onClick={() => onItemChange({ current_watch: round + 1, status: 'watching' })}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
          >
            ↻ Opnieuw kijken
          </button>
        )}
        {/* Per ongeluk opnieuw begonnen? Zolang er nog niets is afgevinkt kun je terug. */}
        {isSeries && round > 1 && watchedThisRound === 0 && !adding && (
          <button
            onClick={() => onItemChange({ current_watch: round - 1 })}
            className="px-2 py-1.5 text-sm text-muted hover:text-fg"
          >
            Terug naar vorige keer
          </button>
        )}
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  )
}
