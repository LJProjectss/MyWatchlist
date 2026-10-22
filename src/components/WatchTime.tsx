import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WatchlistItem } from '../lib/types'
import { fetchRuntime, formatDuration, loadWatchSessions, needsRuntime, type WatchSession } from '../lib/watchtime'

const now = new Date()

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

export default function WatchTime({ items }: { items: WatchlistItem[] }) {
  const [sessions, setSessions] = useState<WatchSession[] | null>(null)
  const [missing, setMissing] = useState(() => items.filter(needsRuntime).length)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Eerst ontbrekende speelduren aanvullen (één voor één, i.v.m. limieten van Jikan)
      const list = items.map((i) => ({ ...i }))
      for (const item of list.filter(needsRuntime)) {
        if (cancelled) return
        const runtime = await fetchRuntime(item).catch(() => null)
        if (runtime) {
          item.runtime = runtime
          await supabase.from('watchlist_items').update({ runtime }).eq('id', item.id)
        }
        setMissing((n) => n - 1)
        if (item.source === 'jikan') await new Promise((r) => setTimeout(r, 400))
      }
      const result = await loadWatchSessions(list)
      if (!cancelled) setSessions(result)
    })().catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [items])

  if (error) return <p className="text-sm text-bad">Kijktijd berekenen mislukt: {error}</p>
  if (!sessions) {
    return (
      <p className="text-sm text-muted">
        Kijktijd berekenen…{missing > 0 ? ` (speelduur ophalen, nog ${missing})` : ''}
      </p>
    )
  }

  const thisMonth = now.toISOString().slice(0, 7)
  const thisYear = String(now.getFullYear())
  const sum = (filter: (s: WatchSession) => boolean) => sessions.filter(filter).reduce((t, s) => t + s.minutes, 0)
  const total = sum(() => true)

  // Laatste twaalf maanden, oudste eerst
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { key, label: MONTHS[d.getMonth()], year: d.getFullYear(), minutes: sum((s) => s.date.startsWith(key)) }
  })
  const maxMonth = Math.max(1, ...months.map((m) => m.minutes))

  const years = [...new Set(sessions.map((s) => s.date.slice(0, 4)))]
    .sort()
    .reverse()
    .map((year) => ({ year, minutes: sum((s) => s.date.startsWith(year)) }))
  const maxYear = Math.max(1, ...years.map((y) => y.minutes))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Figure
          label="Totaal"
          value={formatDuration(total)}
          note={total >= 1440 ? `${(total / 1440).toFixed(1).replace('.', ',')} dagen` : undefined}
        />
        <Figure label="Deze maand" value={formatDuration(sum((s) => s.date.startsWith(thisMonth)))} />
        <Figure label="Dit jaar" value={formatDuration(sum((s) => s.date.startsWith(thisYear)))} />
      </div>

      <div>
        <p className="mb-2 text-sm text-muted">Per maand (uren)</p>
        <div className="flex h-36 items-end gap-1 border-b border-line sm:gap-1.5">
          {months.map((m) => (
            <div
              key={m.key}
              className="group relative flex h-full flex-1 items-end"
              title={`${m.label} ${m.year}: ${formatDuration(m.minutes)}`}
            >
              <div
                className="w-full rounded-t bg-accent transition group-hover:bg-accent-hover"
                style={{ height: `${(m.minutes / maxMonth) * 100}%`, minHeight: m.minutes ? 4 : 0 }}
              />
              {m.minutes > 0 && (
                <span
                  className="absolute inset-x-0 translate-y-0 pb-0.5 text-center text-[11px] text-muted tabular-nums opacity-0 transition group-hover:opacity-100"
                  style={{ bottom: `${(m.minutes / maxMonth) * 100}%` }}
                >
                  {Math.round(m.minutes / 60)}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1 sm:gap-1.5">
          {months.map((m) => (
            <span key={m.key} className="flex-1 text-center text-[11px] text-muted">
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {years.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Per jaar</p>
          <ul className="space-y-3">
            {years.map((y) => (
              <li key={y.year} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{y.year}</span>
                  <span className="text-muted tabular-nums">{formatDuration(y.minutes)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(y.minutes / maxYear) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted">
        Telt elke aflevering die je hebt afgevinkt (ook bij herkijken) en elke keer dat je een film hebt gezien. Afleveringen
        die je in één keer afvinkt, tellen mee op de dag van afvinken.
      </p>
    </div>
  )
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md bg-surface p-3">
      <p className="text-base font-semibold tabular-nums sm:text-xl">{value}</p>
      <p className="text-xs text-muted">
        {label}
        {note ? ` · ${note}` : ''}
      </p>
    </div>
  )
}
