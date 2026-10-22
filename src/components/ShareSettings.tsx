import { useEffect, useState } from 'react'
import { createShare, deleteShare, loadShares, renameShares, shareUrl, type Share, type ShareKind } from '../lib/shares'

const KINDS: [ShareKind, string][] = [
  ['list', 'Hele lijst'],
  ['top10', 'Top 10'],
]

// Openbare links aanmaken, kopiëren en weer uitzetten
export default function ShareSettings() {
  const [shares, setShares] = useState<Share[] | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    loadShares()
      .then((list) => {
        setShares(list)
        setName(list[0]?.name ?? '')
      })
      .catch((e) => setError(e.message))
  }, [])

  async function attempt(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function copy(share: Share) {
    const url = shareUrl(share.token)
    // Op telefoon het deelmenu, anders naar het klembord
    if (navigator.share) {
      await navigator.share({ url }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(url)
    setCopied(share.token)
    setTimeout(() => setCopied(null), 2000)
  }

  if (!shares) return <p className="text-sm text-muted">{error ?? 'Laden…'}</p>

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm text-muted">Naam op de gedeelde pagina</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() =>
            shares.length > 0 &&
            name !== (shares[0].name ?? '') &&
            attempt(async () => {
              await renameShares(name.trim() || null)
              setShares(shares.map((s) => ({ ...s, name: name.trim() || null })))
            })
          }
          placeholder="Bijv. je voornaam"
          className="w-full max-w-xs rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <ul className="space-y-3">
        {KINDS.map(([kind, label]) => {
          const share = shares.find((s) => s.kind === kind)
          return (
            <li key={kind} className="space-y-2">
              <p className="text-sm font-medium">{label}</p>
              {share ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl(share.token)}
                    onFocus={(e) => e.target.select()}
                    className="min-w-0 flex-1 basis-56 rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted outline-none"
                  />
                  <button
                    onClick={() => attempt(() => copy(share))}
                    className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                  >
                    {copied === share.token ? 'Gekopieerd' : 'Delen'}
                  </button>
                  <button
                    onClick={() =>
                      confirm('Deze link uitzetten? Wie hem heeft, kan je lijst dan niet meer zien.') &&
                      attempt(async () => {
                        await deleteShare(share.token)
                        setShares(shares.filter((s) => s.token !== share.token))
                      })
                    }
                    className="rounded-md border border-line px-3 py-2 text-sm text-muted hover:text-bad"
                  >
                    Uitzetten
                  </button>
                </div>
              ) : (
                <button
                  onClick={() =>
                    attempt(async () => {
                      const created = await createShare(kind, name.trim() || null)
                      setShares([...shares, created])
                    })
                  }
                  className="rounded-md border border-line px-4 py-2 text-sm text-muted hover:text-fg"
                >
                  Link maken
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  )
}
