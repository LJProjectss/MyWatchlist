import { useEffect, useState } from 'react'
import { currentSubscription, disablePush, enablePush, needsHomeScreen, pushSupported, sendTestPush } from '../lib/push'

// Meldingen aan- en uitzetten voor dit apparaat
export default function PushSettings() {
  const [sub, setSub] = useState<PushSubscription | null>(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    currentSubscription()
      .then(setSub)
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setMessage(null)
    try {
      await action()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
    setBusy(false)
  }

  if (needsHomeScreen()) {
    return (
      <p className="text-sm text-muted">
        Op iPhone en iPad werken meldingen alleen in de app op je beginscherm. Open deze site in Safari, tik op{' '}
        <span className="text-fg">Deel</span> en kies <span className="text-fg">Zet op beginscherm</span>. Open de app daarna
        vanaf je beginscherm en zet hier de meldingen aan.
      </p>
    )
  }
  if (!pushSupported()) return <p className="text-sm text-muted">Deze browser ondersteunt geen meldingen.</p>
  if (checking) return <p className="text-sm text-muted">Laden…</p>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {sub ? (
          <>
            <button
              onClick={() =>
                run(async () => {
                  await sendTestPush(sub)
                  setMessage({ ok: true, text: 'Testmelding verstuurd. Je ziet hem zo verschijnen.' })
                })
              }
              disabled={busy}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Testmelding sturen
            </button>
            <button
              onClick={() =>
                run(async () => {
                  await disablePush()
                  setSub(null)
                  setMessage({ ok: true, text: 'Meldingen staan uit op dit apparaat.' })
                })
              }
              disabled={busy}
              className="rounded-md border border-line px-4 py-2 text-sm text-muted hover:text-fg disabled:opacity-50"
            >
              Meldingen uitzetten
            </button>
          </>
        ) : (
          <button
            onClick={() =>
              run(async () => {
                setSub(await enablePush())
                setMessage({ ok: true, text: 'Meldingen staan aan op dit apparaat.' })
              })
            }
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? 'Bezig…' : 'Meldingen aanzetten'}
          </button>
        )}
      </div>
      {message && <p className={`text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
    </div>
  )
}
