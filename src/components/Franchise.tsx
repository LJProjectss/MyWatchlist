import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogResult } from '../lib/catalog'
import { loadFranchise, type Franchise as FranchiseData } from '../lib/franchise'
import { findOwned, ownedKey, type Owned } from '../lib/owned'
import { displayTitle } from '../lib/titles'
import { formatRating, STATUS_LABELS, type WatchlistItem } from '../lib/types'
import AddDialog from './AddDialog'

// Alle delen van een filmreeks of anime-reeks in kijkvolgorde, met wat je al hebt gezien
export default function Franchise({ item }: { item: WatchlistItem }) {
  const [data, setData] = useState<FranchiseData | null>(null)
  const [owned, setOwned] = useState<Map<string, Owned>>(new Map())
  const [loading, setLoading] = useState(item.media_type !== 'tv')
  const [adding, setAdding] = useState<CatalogResult | null>(null)
  const { source, media_type, external_id } = item

  useEffect(() => {
    if (media_type === 'tv') return
    let cancelled = false
    loadFranchise({ source, media_type, external_id })
      .then(async (franchise) => {
        if (cancelled) return
        setData(franchise)
        if (franchise) {
          const map = await findOwned(source, franchise.entries.map((e) => e.result.external_id)).catch(() => new Map())
          if (!cancelled) setOwned(map)
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [source, media_type, external_id])

  if (media_type === 'tv' || (!loading && !data)) return null

  const main = data?.entries.filter((e) => e.relation === null) ?? []
  const seen = main.filter((e) => owned.get(ownedKey(e.result.media_type, e.result.external_id))?.status === 'completed').length

  return (
    <section className="space-y-3 border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Kijkvolgorde{data && <span className="font-normal text-muted"> · {data.name}</span>}</h2>
        {data && (
          <p className="text-sm text-muted">
            {seen} van {main.length} gezien
          </p>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-muted">Reeks opzoeken…</p>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
          {data!.entries.map((entry, index) => {
            const r = entry.result
            const mine = owned.get(ownedKey(r.media_type, r.external_id))
            const current = r.source === source && r.external_id === external_id
            const number = entry.relation === null ? main.indexOf(entry) + 1 : null
            const body = (
              <>
                <span className="w-6 shrink-0 text-center text-sm text-muted tabular-nums">{number ?? '↳'}</span>
                <div className="aspect-[2/3] w-9 shrink-0 self-start overflow-hidden rounded bg-panel-hover">
                  {r.poster_url && <img src={r.poster_url} alt="" loading="lazy" className="size-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`line-clamp-2 text-sm leading-snug font-medium ${current ? 'text-accent-hover' : ''}`}>{displayTitle(r)}</p>
                  <p className="text-xs text-muted">
                    {[entry.relation, r.subtype, r.year].filter(Boolean).join(' · ')}
                    {current && ' · deze titel'}
                  </p>
                </div>
              </>
            )
            return (
              <li key={`${r.external_id}-${index}`} className={entry.relation ? 'bg-surface/40' : ''}>
                {mine ? (
                  <Link to={`/titel/${mine.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-panel-hover">
                    {body}
                    <span
                      className={`shrink-0 text-xs ${mine.status === 'completed' ? 'text-good' : 'text-muted'}`}
                    >
                      {mine.status === 'completed' ? '✓ ' : ''}
                      {STATUS_LABELS[mine.status]}
                      {mine.rating !== null && <span className="ml-1.5 text-star">★ {formatRating(Number(mine.rating))}</span>}
                    </span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2">
                    {body}
                    <button
                      onClick={() => setAdding(r)}
                      className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs text-muted hover:text-fg"
                    >
                      + Toevoegen
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {adding && (
        <AddDialog
          result={adding}
          initialStatus="plan_to_watch"
          onClose={() => setAdding(null)}
          onAdded={(added) => {
            setOwned((prev) =>
              new Map(prev).set(ownedKey(added.media_type, added.external_id), {
                id: added.id,
                status: added.status,
                rating: added.rating,
              }),
            )
            setAdding(null)
          }}
        />
      )}
    </section>
  )
}
