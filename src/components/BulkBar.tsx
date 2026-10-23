import { STATUS_LABELS, type WatchStatus, type WatchlistItem } from '../lib/types'

// Balk bovenin tijdens het selecteren: status, label of verwijderen voor alle gekozen titels tegelijk
export default function BulkBar({
  items,
  allTags,
  allSelected,
  onSelectAll,
  onStatus,
  onTag,
  onDelete,
}: {
  items: WatchlistItem[]
  allTags: string[]
  allSelected: boolean
  onSelectAll: (all: boolean) => void
  onStatus: (items: WatchlistItem[], status: WatchStatus) => Promise<void>
  onTag: (items: WatchlistItem[], tag: string, add: boolean) => Promise<void>
  onDelete: (items: WatchlistItem[]) => Promise<void>
}) {
  const none = items.length === 0
  const usedTags = [...new Set(items.flatMap((i) => i.tags ?? []))].sort()

  function chooseTag(value: string) {
    if (!value) return
    if (value === 'new') {
      const tag = prompt('Nieuw label')?.trim()
      if (tag) void onTag(items, tag, true)
      return
    }
    const [action, ...rest] = value.split(':')
    void onTag(items, rest.join(':'), action === 'add')
  }

  const control =
    'min-w-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-50'

  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 border-y border-line bg-panel/95 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-medium tabular-nums">
          {items.length} geselecteerd
        </span>
        <button onClick={() => onSelectAll(!allSelected)} className="text-sm text-accent-hover hover:underline">
          {allSelected ? 'Niets selecteren' : 'Alles selecteren'}
        </button>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <select
            value=""
            disabled={none}
            onChange={(e) => e.target.value && void onStatus(items, e.target.value as WatchStatus)}
            aria-label="Status voor de selectie"
            className={`flex-1 sm:flex-none ${control}`}
          >
            <option value="">Status…</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value=""
            disabled={none}
            onChange={(e) => chooseTag(e.target.value)}
            aria-label="Label voor de selectie"
            className={`flex-1 sm:flex-none ${control}`}
          >
            <option value="">Label…</option>
            <option value="new">+ Nieuw label…</option>
            {allTags.length > 0 && (
              <optgroup label="Toevoegen">
                {allTags.map((tag) => (
                  <option key={tag} value={`add:${tag}`}>
                    + {tag}
                  </option>
                ))}
              </optgroup>
            )}
            {usedTags.length > 0 && (
              <optgroup label="Weghalen">
                {usedTags.map((tag) => (
                  <option key={tag} value={`remove:${tag}`}>
                    − {tag}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            disabled={none}
            onClick={() => void onDelete(items)}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-bad hover:border-bad/60 disabled:opacity-50"
          >
            Verwijderen
          </button>
        </div>
      </div>
    </div>
  )
}
