import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { loadSharedList, type SharedItem, type ShareKind } from '../lib/shares'
import { displayTitle } from '../lib/titles'
import { formatRating, MEDIA_LABELS, STATUS_LABELS, type WatchStatus } from '../lib/types'

const STATUS_ORDER: WatchStatus[] = ['watching', 'completed', 'plan_to_watch', 'on_hold', 'dropped']

// Openbare pagina voor een deellink; te bekijken zonder account
export default function SharedList() {
  const { token } = useParams()
  const [data, setData] = useState<{ kind: ShareKind; name: string | null; items: SharedItem[] } | null | undefined>()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (token) loadSharedList(token).then(setData).catch((e) => setError(e.message))
  }, [token])

  const heading = data && `${data.kind === 'top10' ? 'Top 10' : 'Lijst'}${data.name ? ` van ${data.name}` : ''}`
  useEffect(() => {
    if (heading) document.title = `${heading} · MyWatchlist`
  }, [heading])

  return (
    <div className="min-h-dvh pt-[env(safe-area-inset-top)]">
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <p className="flex items-center gap-2 text-sm font-semibold tracking-tight text-muted">
          <img src="/favicon.svg" alt="" className="size-6" />
          MyWatchlist
        </p>
        {error ? (
          <p className="text-bad">Laden mislukt: {error}</p>
        ) : data === undefined ? (
          <p className="text-muted">Laden…</p>
        ) : data === null ? (
          <p className="text-muted">Deze link bestaat niet (meer).</p>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h1>
            {data.items.length === 0 && <p className="text-muted">Hier staat nog niets.</p>}
            {data.kind === 'top10' ? (
              <ol className="space-y-2">
                {data.items.map((item, i) => (
                  <li key={i} className="flex items-center gap-4 rounded-lg border border-line bg-panel p-3">
                    <span className="w-6 text-center text-lg font-semibold text-muted tabular-nums">{i + 1}</span>
                    <Poster item={item} className="w-12" />
                    <Info item={item} />
                  </li>
                ))}
              </ol>
            ) : (
              STATUS_ORDER.map((status) => {
                const group = data.items.filter((i) => i.status === status)
                if (group.length === 0) return null
                return (
                  <section key={status} className="space-y-3">
                    <h2 className="text-lg font-semibold">
                      {STATUS_LABELS[status]} <span className="text-sm font-normal text-muted">{group.length}</span>
                    </h2>
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {group.map((item, i) => (
                        <li key={i} className="flex items-center gap-3 rounded-lg border border-line bg-panel p-2.5">
                          <Poster item={item} className="w-10" />
                          <Info item={item} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })
            )}
          </>
        )}
        <p className="pt-4 text-xs text-muted">
          <a href="/" className="hover:text-fg">
            Zelf je series, films en anime bijhouden? Maak een account bij MyWatchlist.
          </a>
        </p>
      </main>
    </div>
  )
}

function Poster({ item, className }: { item: SharedItem; className: string }) {
  return (
    <div className={`aspect-[2/3] shrink-0 overflow-hidden rounded bg-panel-hover ${className}`}>
      {item.poster_url && <img src={item.poster_url} alt="" loading="lazy" className="size-full object-cover" />}
    </div>
  )
}

function Info({ item }: { item: SharedItem }) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{displayTitle(item)}</p>
        <p className="text-xs text-muted">{[MEDIA_LABELS[item.media_type], item.year].filter(Boolean).join(' · ')}</p>
      </div>
      {item.rating !== null && <span className="shrink-0 font-semibold text-star">★ {formatRating(Number(item.rating))}</span>}
    </>
  )
}
