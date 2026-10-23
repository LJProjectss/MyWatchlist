import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import WatchTime from '../components/WatchTime'
import { getCachedItems } from '../lib/cache'
import { supabase } from '../lib/supabase'
import { loadItems } from '../lib/items'
import { formatRating, MEDIA_LABELS, STATUS_LABELS, type MediaType, type WatchStatus, type WatchlistItem } from '../lib/types'
import { displayTitle } from '../lib/titles'

export default function Stats() {
  const [items, setItems] = useState<WatchlistItem[] | null>(getCachedItems)
  const [episodes, setEpisodes] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadItems().then(({ data, error }) => {
        if (error) {
          if (!getCachedItems()) setError(error.message)
          return
        }
        // Alleen bijwerken als er echt iets veranderd is, anders wordt de kijktijd onnodig opnieuw berekend
        setItems((current) => (JSON.stringify(sortById(current)) === JSON.stringify(sortById(data)) ? current : data))
      })
    supabase
      .from('watched_episodes')
      .select('*', { count: 'exact', head: true })
      .then(({ count }) => setEpisodes(count ?? 0))
  }, [])

  if (error) return <p className="text-bad">Kon je statistieken niet laden: {error}</p>
  if (!items) return <p className="text-muted">Laden…</p>

  const rated = items.filter((i) => i.rating !== null)
  const average = (list: WatchlistItem[]) => {
    const r = list.filter((i) => i.rating !== null)
    return r.length ? (r.reduce((sum, i) => sum + i.rating!, 0) / r.length).toFixed(1).replace('.', ',') : '–'
  }
  const distribution = Array.from({ length: 10 }, (_, i) => rated.filter((r) => Math.round(r.rating!) === i + 1).length)
  const maxCount = Math.max(1, ...distribution)
  const top = [...rated].sort((a, b) => b.rating! - a.rating! || displayTitle(a).localeCompare(displayTitle(b), 'nl')).slice(0, 5)

  // Genres: hoe vaak ze voorkomen en welk cijfer je ze gemiddeld geeft
  const genreRows = [...new Set(items.flatMap((i) => i.genres ?? []))]
    .map((genre) => {
      const list = items.filter((i) => i.genres?.includes(genre))
      return { label: genre, count: list.length, note: `gem. ${average(list)}` }
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'nl'))
    .slice(0, 10)

  // Jouw cijfer naast het gemiddelde van TMDB of MyAnimeList
  const compared = rated
    .filter((i) => i.public_score)
    .map((i) => ({ item: i, diff: Math.round((i.rating! - i.public_score!) * 10) / 10 }))
  const averageDiff = compared.length ? compared.reduce((sum, c) => sum + c.diff, 0) / compared.length : 0
  const byDiff = [...compared].sort((a, b) => b.diff - a.diff)
  const fan = byDiff.filter((c) => c.diff >= 1).slice(0, 3)
  const critic = byDiff.filter((c) => c.diff <= -1).reverse().slice(0, 3)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Statistieken</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Titels in je lijst" value={items.length} />
        <Tile label="Helemaal gekeken" value={items.filter((i) => i.status === 'completed').length} />
        <Tile label="Gemiddeld cijfer" value={average(items)} />
        <Tile label="Afleveringen gekeken" value={episodes ?? '…'} />
      </div>

      <Panel title="Kijktijd">
        <WatchTime items={items} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Per soort">
          <BarList
            rows={(Object.keys(MEDIA_LABELS) as MediaType[]).map((type) => {
              const list = items.filter((i) => i.media_type === type)
              return { label: MEDIA_LABELS[type], count: list.length, note: `gem. ${average(list)}` }
            })}
          />
        </Panel>
        <Panel title="Per status">
          <BarList
            rows={(Object.keys(STATUS_LABELS) as WatchStatus[]).map((status) => ({
              label: STATUS_LABELS[status],
              count: items.filter((i) => i.status === status).length,
            }))}
          />
        </Panel>
      </div>

      {(genreRows.length > 0 || compared.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {genreRows.length > 0 && (
            <Panel title="Favoriete genres">
              <BarList rows={genreRows} />
            </Panel>
          )}
          {compared.length > 0 && (
            <Panel title="Jij vs. het publiek">
              <p className="text-sm">
                {Math.abs(averageDiff) < 0.25 ? (
                  <>Je cijfers liggen gemiddeld dicht bij die van TMDB en MyAnimeList.</>
                ) : (
                  <>
                    Je geeft gemiddeld{' '}
                    <span className="font-semibold">{formatRating(Math.round(Math.abs(averageDiff) * 10) / 10)}</span>{' '}
                    punt {averageDiff > 0 ? 'hoger' : 'lager'} dan TMDB en MyAnimeList.
                  </>
                )}{' '}
                <span className="text-muted">({compared.length} titels vergeleken)</span>
              </p>
              <DiffList title="Jij bent een groter fan" rows={fan} />
              <DiffList title="Jij bent minder onder de indruk" rows={critic} />
            </Panel>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Verdeling van je cijfers">
          {rated.length === 0 ? (
            <p className="text-sm text-muted">Je hebt nog geen cijfers gegeven.</p>
          ) : (
            <div>
              <div className="flex h-40 items-end gap-1.5 border-b border-line">
                {distribution.map((count, i) => (
                  <div
                    key={i}
                    className="group relative flex h-full flex-1 items-end"
                    title={`Cijfer ${i + 1}: ${count} ${count === 1 ? 'titel' : 'titels'}`}
                  >
                    <div
                      className="w-full rounded-t bg-accent transition group-hover:bg-accent-hover"
                      style={{ height: `${(count / maxCount) * 100}%`, minHeight: count ? 4 : 0 }}
                    />
                    {count > 0 && (
                      <span className="absolute inset-x-0 -top-0 -translate-y-full pb-0.5 text-center text-[11px] text-muted opacity-0 transition group-hover:opacity-100">
                        {count}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {distribution.map((_, i) => (
                  <span key={i} className="flex-1 text-center text-xs text-muted">
                    {i + 1}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>
        <Panel title="Jouw hoogste cijfers">
          {top.length === 0 ? (
            <p className="text-sm text-muted">Je hebt nog geen cijfers gegeven.</p>
          ) : (
            <ol className="space-y-2">
              {top.map((item, index) => (
                <li key={item.id} className="flex items-center gap-3">
                  <span className="w-4 text-sm text-muted tabular-nums">{index + 1}</span>
                  <Link to={`/titel/${item.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                    {displayTitle(item)}
                  </Link>
                  <span className="text-sm font-semibold text-star">★ {formatRating(item.rating!)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  )
}

function DiffList({ title, rows }: { title: string; rows: { item: WatchlistItem; diff: number }[] }) {
  if (rows.length === 0) return null
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm text-muted">{title}</h3>
      <ul className="space-y-1.5">
        {rows.map(({ item, diff }) => (
          <li key={item.id} className="flex items-center gap-3 text-sm">
            <Link to={`/titel/${item.id}`} className="min-w-0 flex-1 truncate hover:underline">
              {displayTitle(item)}
            </Link>
            <span className="shrink-0 text-muted tabular-nums">
              <span className="text-star">★ {formatRating(item.rating!)}</span> vs {formatRating(item.public_score!)}
            </span>
            <span className={`w-10 shrink-0 text-right tabular-nums ${diff > 0 ? 'text-good' : 'text-bad'}`}>
              {diff > 0 ? '+' : '−'}
              {formatRating(Math.abs(diff))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <p className="text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-line bg-panel p-4 sm:p-5">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  )
}

function BarList({ rows }: { rows: { label: string; count: number; note?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{row.label}</span>
            <span className="text-muted tabular-nums">
              {row.count}
              {row.note && row.count > 0 ? ` · ${row.note}` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function sortById(list: WatchlistItem[] | null) {
  return list ? [...list].sort((a, b) => a.id.localeCompare(b.id)) : null
}
