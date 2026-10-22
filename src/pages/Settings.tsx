import { useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { downloadCsv, downloadJsonBackup } from '../lib/backup'
import { supabase } from '../lib/supabase'
import { getTheme, setTheme, type ThemeChoice } from '../lib/theme'

const THEMES: [ThemeChoice, string][] = [
  ['system', 'Automatisch'],
  ['light', 'Licht'],
  ['dark', 'Donker'],
]

export default function Settings() {
  const { session } = useAuth()
  const [theme, setThemeState] = useState(getTheme)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function download(kind: 'json' | 'csv') {
    setBusy(kind)
    setMessage(null)
    try {
      const count = await (kind === 'json' ? downloadJsonBackup() : downloadCsv())
      setMessage({ ok: true, text: `Gedownload: ${count} ${count === 1 ? 'titel' : 'titels'}.` })
    } catch (e) {
      setMessage({ ok: false, text: `Downloaden mislukt: ${e instanceof Error ? e.message : String(e)}` })
    }
    setBusy(null)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Instellingen</h1>

      <Section title="Thema" description="Automatisch volgt de instelling van je telefoon of computer.">
        <div className="flex w-fit rounded-lg border border-line bg-surface p-1">
          {THEMES.map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setTheme(key)
                setThemeState(key)
              }}
              aria-pressed={theme === key}
              className={`rounded-md px-4 py-1.5 text-sm transition ${
                theme === key ? 'bg-accent text-white' : 'text-muted hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Back-up"
        description="Download je hele lijst, inclusief cijfers, notities, labels, bekeken afleveringen en kijkgeschiedenis."
      >
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => download('json')}
            disabled={busy !== null}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy === 'json' ? 'Bezig…' : 'Volledige back-up (.json)'}
          </button>
          <button
            onClick={() => download('csv')}
            disabled={busy !== null}
            className="rounded-md border border-line px-4 py-2 text-sm text-muted hover:text-fg disabled:opacity-50"
          >
            {busy === 'csv' ? 'Bezig…' : 'Lijst voor Excel (.csv)'}
          </button>
        </div>
        {message && <p className={`text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
      </Section>

      <Section title="Account" description={session?.user.email ? `Ingelogd als ${session.user.email}` : undefined}>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-md border border-line px-4 py-2 text-sm text-bad hover:border-bad/60"
        >
          Uitloggen
        </button>
      </Section>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel p-4 sm:p-5">
      <div>
        <h2 className="font-medium">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}
