import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadCredits, type Person } from '../lib/credits'
import type { WatchlistItem } from '../lib/types'

// Cast en makers; tik op iemand om te zien wat je nog meer met die persoon hebt gezien
export default function Credits({ item }: { item: WatchlistItem }) {
  const [credits, setCredits] = useState<{ cast: Person[]; crew: Person[] } | null>(null)
  const { source, media_type, external_id } = item

  useEffect(() => {
    let cancelled = false
    loadCredits({ source, media_type, external_id })
      .then((c) => !cancelled && setCredits(c))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [source, media_type, external_id])

  if (!credits || (credits.cast.length === 0 && credits.crew.length === 0)) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm text-muted">Cast en crew</h2>
      {credits.crew.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {credits.crew.map((p) => (
            <Link key={p.id} to={`/persoon/${p.source}/${p.id}`} className="hover:underline">
              <span className="text-muted">{p.role}:</span> {p.name}
            </Link>
          ))}
        </p>
      )}
      {credits.cast.length > 0 && (
        // Op telefoon horizontaal scrollen, op grotere schermen een raster
        <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] sm:overflow-visible sm:px-0">
          {credits.cast.map((p) => (
            <li key={`${p.id}-${p.role}`} className="w-24 shrink-0 sm:w-auto">
              <Link to={`/persoon/${p.source}/${p.id}`} className="group block space-y-1.5">
                <div className="aspect-[2/3] overflow-hidden rounded-md bg-panel-hover">
                  {p.image ? (
                    <img src={p.image} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-2xl text-muted">{p.name[0]}</span>
                  )}
                </div>
                <p className="line-clamp-2 text-xs font-medium leading-snug group-hover:underline">{p.name}</p>
                {p.role && <p className="line-clamp-2 text-xs leading-snug text-muted">{p.role}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
