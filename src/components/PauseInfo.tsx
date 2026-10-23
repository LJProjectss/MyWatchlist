import { useState } from 'react'
import { formatSince, monthsFromNow, REMIND_OPTIONS } from '../lib/reminders'
import type { WatchlistItem } from '../lib/types'

// Reden en herinnering bij een gepauzeerde of gestopte titel
export default function PauseInfo({
  item,
  onChange,
}: {
  item: WatchlistItem
  onChange: (changes: Partial<WatchlistItem>) => void
}) {
  const [reason, setReason] = useState(item.pause_reason ?? '')
  const label = item.status === 'dropped' ? 'gestopt' : 'gepauzeerd'

  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4">
      <div>
        <h2 className="text-sm font-medium">Waarom {label}?</h2>
        {item.paused_at && <p className="text-xs text-muted">Sinds {formatSince(item.paused_at)}</p>}
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onBlur={() => reason.trim() !== (item.pause_reason ?? '') && onChange({ pause_reason: reason.trim() || null })}
        rows={2}
        placeholder={item.status === 'dropped' ? 'Bijv. te traag, niet mijn ding' : 'Bijv. wacht tot het nieuwe seizoen compleet is'}
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Herinner me om het opnieuw te proberen:</span>
        <select
          value=""
          onChange={(e) => {
            const months = Number(e.target.value)
            onChange({ remind_at: months ? monthsFromNow(months) : null })
          }}
          className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="" disabled>
            {item.remind_at ? `Op ${formatSince(item.remind_at)}` : 'Niet herinneren'}
          </option>
          {REMIND_OPTIONS.map(([months, text]) => (
            <option key={months} value={months}>
              {text}
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}
