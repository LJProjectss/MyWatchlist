import { useEffect, useState } from 'react'
import { JIKAN, tmdb } from '../lib/catalog'
import type { WatchlistItem } from '../lib/types'

interface Provider {
  provider_id: number
  provider_name: string
  logo_path: string
  display_priority: number
}

interface CountryProviders {
  link: string
  flatrate?: Provider[]
  free?: Provider[]
  ads?: Provider[]
  rent?: Provider[]
  buy?: Provider[]
}

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'tmdb'; data: CountryProviders | null }
  | { kind: 'jikan'; links: { name: string; url: string }[] }

const COUNTRY = 'NL'

export default function WhereToWatch({ item }: { item: WatchlistItem }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    const load =
      item.source === 'tmdb'
        ? tmdb<{ results: Record<string, CountryProviders> }>(`${item.media_type}/${item.external_id}/watch/providers`).then(
            (r): State => ({ kind: 'tmdb', data: r.results[COUNTRY] ?? null }),
          )
        : fetch(`${JIKAN}/anime/${item.external_id}/streaming`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((r): State => ({ kind: 'jikan', links: r.data ?? [] }))
    load.then((s) => !cancelled && setState(s)).catch(() => !cancelled && setState({ kind: 'error' }))
    return () => {
      cancelled = true
    }
  }, [item.source, item.media_type, item.external_id])

  if (state.kind === 'loading') return <p className="text-sm text-muted">Laden…</p>
  if (state.kind === 'error') return <p className="text-sm text-muted">Kon niet ophalen waar je dit kunt kijken.</p>

  if (state.kind === 'jikan') {
    if (state.links.length === 0) return <p className="text-sm text-muted">Geen streamingdiensten bekend bij MyAnimeList.</p>
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {state.links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm hover:border-accent/60"
            >
              {l.name} ↗
            </a>
          ))}
        </div>
        <p className="text-xs text-muted">Bron: MyAnimeList. Niet elke dienst is in Nederland beschikbaar.</p>
      </div>
    )
  }

  const data = state.data
  const groups: [string, Provider[]][] = data
    ? [
        ['Bij je abonnement', dedupe([...(data.flatrate ?? []), ...(data.free ?? []), ...(data.ads ?? [])])],
        ['Huren', dedupe(data.rent ?? [])],
        ['Kopen', dedupe(data.buy ?? [])],
      ]
    : []
  const nonEmpty = groups.filter(([, list]) => list.length > 0)

  if (nonEmpty.length === 0) return <p className="text-sm text-muted">Op dit moment niet te streamen in Nederland.</p>

  return (
    <div className="space-y-3">
      {nonEmpty.map(([label, list]) => (
        <div key={label} className="space-y-1.5">
          <p className="text-xs text-muted">{label}</p>
          <div className="flex flex-wrap gap-2">
            {list.map((p) => (
              <a
                key={p.provider_id}
                href={data!.link}
                target="_blank"
                rel="noreferrer"
                title={p.provider_name}
                className="flex items-center gap-2 rounded-lg border border-line bg-panel py-1 pr-3 pl-1 text-sm hover:border-accent/60"
              >
                <img src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} alt="" className="size-7 rounded-md" />
                {p.provider_name}
              </a>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted">Bron: JustWatch via TMDB.</p>
    </div>
  )
}

function dedupe(list: Provider[]) {
  const seen = new Set<number>()
  return list
    .filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id))
    .sort((a, b) => a.display_priority - b.display_priority)
}
