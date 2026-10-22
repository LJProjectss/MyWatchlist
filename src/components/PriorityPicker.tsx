import { PRIORITY_LABELS, type Priority } from '../lib/types'

const PRIORITY_STYLES: Record<Priority, string> = {
  1: 'border-rose-400 bg-rose-400/15 text-rose-300',
  2: 'border-sky-400 bg-sky-400/15 text-sky-300',
  3: 'border-slate-400 bg-slate-400/15 text-slate-300',
}

export default function PriorityPicker({
  value,
  onChange,
}: {
  value: Priority | null
  onChange: (priority: Priority | null) => void
}) {
  return (
    <div className="flex gap-1.5">
      {([1, 2, 3] as Priority[]).map((p) => (
        <button
          key={p}
          type="button"
          // Nogmaals klikken haalt de prioriteit weer weg
          onClick={() => onChange(value === p ? null : p)}
          aria-pressed={value === p}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            value === p ? PRIORITY_STYLES[p] : 'border-line bg-surface text-muted hover:text-white'
          }`}
        >
          {PRIORITY_LABELS[p]}
        </button>
      ))}
    </div>
  )
}
