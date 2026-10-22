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
              ? 'border-star bg-star text-surface'
              : value !== null && n < value
                ? 'border-star/40 bg-star/10 text-star'
                : 'border-line bg-surface text-muted hover:border-star/60 hover:text-fg'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
