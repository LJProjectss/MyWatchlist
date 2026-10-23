import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AddDialog from '../components/AddDialog'
import type { CatalogResult } from '../lib/catalog'
import { loadPerson, type PersonCredit, type PersonDetails } from '../lib/credits'
import { findOwned, ownedKey, type Owned } from '../lib/owned'
import { displayTitle } from '../lib/titles'
import { formatRating, MEDIA_LABELS, STATUS_LABELS, type Source } from '../lib/types'

// Wat je met een acteur, regisseur of stemacteur hebt gezien, en waar die nog meer in zit
export default function PersonPage() {
  const { source, id } = useParams() as { source: Source; id: string }
  const navigate = useNavigate()
  const [person, setPerson] = useState<PersonDetails | null>(null)
  const [owned, setOwned] = useState<Map<string, Owned> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<CatalogResult | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadPerson(source, id)
      .then(async (p) => {
        if (cancelled) return
        setPerson(p)
        const map = await findOwned(source, p.credits.map((c) => c.result.external_id)).catch(() => new Map())
        if (!cancelled) setOwned(map)
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [source, id])

  if (error) return <p className="text-bad">Laden mislukt: {error}</p>
  if (!person || !owned) return <p className="text-muted">Laden…</p>

  const key = (c: PersonCredit) => ownedKey(c.result.media_type, c.result.external_id)
  const mine = person.credits.filter((c) => owned.has(key(c)))
  const others = person.credits.filter((c) => !owned.has(key(c))).sort((a, b) => b.popularity - a.popularity)
  const shownOthers = showAll ? others : others.slice(0, 18)

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="text-sm text-muted hover:text-fg">
        ← Terug
      </button>

      <div className="flex items-center gap-4">
        <div className="aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-lg bg-panel-hover sm:w-24">
          {person.image && <img src={person.image} alt="" className="size-full object-cover" />}
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{person.name}</h1>
          <p className="text-sm text-muted">
            {[person.known_for, `${mine.length} ${mine.length === 1 ? 'titel' : 'titels'} in je lijst`].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">In je lijst</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted">Je hebt nog niets met {person.name} in je lijst.</p>
        ) : (
          <CreditGrid
            credits={mine}
            render={(c) => {
              const o = owned.get(key(c))!
              return (
                <Link to={`/titel/${o.id}`} className="block">
                  <CreditBody credit={c} />
                  <p className="text-xs">
                    <span className={o.status === 'completed' ? 'text-good' : 'text-muted'}>{STATUS_LABELS[o.status]}</span>
                    {o.rating !== null && <span className="ml-1.5 text-star">★ {formatRating(Number(o.rating))}</span>}
                  </p>
                </Link>
              )
            }}
          />
        )}
      </section>

      {others.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Ook bekend van</h2>
          <CreditGrid
            credits={shownOthers}
            render={(c) => (
              <button onClick={() => setAdding(c.result)} className="block w-full text-left" title="Toevoegen aan je lijst">
                <CreditBody credit={c} />
                <p className="text-xs text-accent-hover">+ Toevoegen</p>
              </button>
            )}
          />
          {others.length > shownOthers.length && (
            <button onClick={() => setShowAll(true)} className="text-sm text-accent-hover hover:underline">
              Alle {others.length} titels tonen
            </button>
          )}
        </section>
      )}

      {adding && (
        <AddDialog
          result={adding}
          initialStatus="plan_to_watch"
          onClose={() => setAdding(null)}
          onAdded={(added) => {
            setOwned((prev) =>
              new Map(prev).set(ownedKey(added.media_type, added.external_id), { id: added.id, status: added.status, rating: added.rating }),
            )
            setAdding(null)
          }}
        />
      )}
    </div>
  )
}

function CreditGrid({ credits, render }: { credits: PersonCredit[]; render: (c: PersonCredit) => ReactNode }) {
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      {credits.map((c) => (
        <li key={`${c.result.media_type}-${c.result.external_id}`}>{render(c)}</li>
      ))}
    </ul>
  )
}

function CreditBody({ credit }: { credit: PersonCredit }) {
  const r = credit.result
  return (
    <>
      <div className="mb-1.5 aspect-[2/3] overflow-hidden rounded-md bg-panel-hover">
        {r.poster_url && <img src={r.poster_url} alt="" loading="lazy" className="size-full object-cover" />}
      </div>
      <p className="line-clamp-2 text-xs font-medium leading-snug">{displayTitle(r)}</p>
      <p className="line-clamp-1 text-xs text-muted">{[MEDIA_LABELS[r.media_type], r.year].filter(Boolean).join(' · ')}</p>
      {credit.role && <p className="line-clamp-1 text-xs text-muted">{credit.role}</p>}
    </>
  )
}
