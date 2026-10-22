import { STATUS_LABELS, type WatchStatus } from '../lib/types'

export default function StatusPicker({
  value,
  onChange,
}: {
  value: WatchStatus
  onChange: (status: WatchStatus) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(STATUS_LABELS) as WatchStatus[]).map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onChange(status)}
          aria-pressed={value === status}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            value === status
              ? 'border-accent bg-accent text-white'
              : 'border-line bg-surface text-muted hover:border-accent/60 hover:text-white'
          }`}
        >
          {STATUS_LABELS[status]}
        </button>
      ))}
    </div>
  )
}
