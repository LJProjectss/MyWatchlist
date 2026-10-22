export default function RatingPicker({
  value,
  onChange,
}: {
  value: number | null
  onChange: (rating: number | null) => void
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          // Nogmaals klikken op het gekozen cijfer haalt het weer weg
          onClick={() => onChange(value === n ? null : n)}
          aria-pressed={value === n}
          className={`rounded-md border py-2 text-sm font-medium transition ${
            value === n
              ? 'border-amber-400 bg-amber-400 text-slate-900'
              : value !== null && n < value
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                : 'border-line bg-surface text-muted hover:border-amber-400/60 hover:text-white'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
