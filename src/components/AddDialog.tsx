import { useState } from 'react'
import { fetchExtraDetails, type CatalogResult } from '../lib/catalog'
import { setEpisodesWatched } from '../lib/episodes'
import { supabase } from '../lib/supabase'
import { MEDIA_LABELS, type Priority, type WatchStatus, type WatchlistItem } from '../lib/types'
import PriorityPicker from './PriorityPicker'
import RatingPicker from './RatingPicker'
import StatusPicker from './StatusPicker'

export default function AddDialog({
  result,
  onClose,
  onAdded,
  initialStatus = 'completed',
}: {
  result: CatalogResult
  onClose: () => void
  onAdded: (item: WatchlistItem) => void
  initialStatus?: WatchStatus
}) {
  const [status, setStatus] = useState<WatchStatus>(initialStatus)
  const [rating, setRating] = useState<number | null>(null)
  const [priority, setPriority] = useState<Priority | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    setBusy(true)
    setError(null)
    try {
      const extra = await fetchExtraDetails(result)
      const { data, error } = await supabase
        .from('watchlist_items')
        .insert({
          source: result.source,
          media_type: result.media_type,
          external_id: result.external_id,
          imdb_id: extra.imdb_id,
          title: result.title,
          original_title: result.original_title,
          poster_url: result.poster_url,
          year: result.year,
          total_episodes: extra.total_episodes,
          seasons: extra.seasons,
          status,
          rating: status === 'plan_to_watch' ? null : rating,
          priority: status === 'plan_to_watch' ? priority : null,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      // Al helemaal gezien? Dan meteen alle afleveringen afvinken.
      if (status === 'completed' && extra.seasons) {
        await setEpisodesWatched(
          data,
          extra.seasons.flatMap((s) =>
            Array.from({ length: s.episode_count }, (_, i) => ({ season_number: s.season_number, episode_number: i + 1 })),
          ),
          true,
        )
      }
      onAdded(data as WatchlistItem)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex gap-4">
          <div className="aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-md bg-panel-hover">
            {result.poster_url && <img src={result.poster_url} alt="" className="size-full object-cover" />}
          </div>
          <div className="min-w-0">
            <h2 id="add-title" className="font-semibold leading-snug">
              {result.title}
            </h2>
            <p className="text-sm text-muted">
              {MEDIA_LABELS[result.media_type]}
              {result.year ? ` · ${result.year}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <p className="text-sm text-muted">Status</p>
          <StatusPicker value={status} onChange={setStatus} />
        </div>
        {status === 'plan_to_watch' ? (
          <div className="mt-5 space-y-2">
            <p className="text-sm text-muted">Prioriteit (optioneel)</p>
            <PriorityPicker value={priority} onChange={setPriority} />
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            <p className="text-sm text-muted">Cijfer (optioneel)</p>
            <RatingPicker value={rating} onChange={setRating} />
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-400">Toevoegen mislukt: {error}</p>}

        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-line py-2 text-sm text-muted hover:text-white"
          >
            Annuleren
          </button>
          <button
            onClick={handleAdd}
            disabled={busy}
            className="flex-1 rounded-md bg-accent py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? 'Bezig…' : 'Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  )
}
