import { useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import PasswordForm from '../components/PasswordForm'
import PushSettings from '../components/PushSettings'
import ShareSettings from '../components/ShareSettings'
import { downloadCsv, downloadJsonBackup, restoreJsonBackup } from '../lib/backup'
import { supabase } from '../lib/supabase'
import { getTheme, setTheme, type ThemeChoice } from '../lib/theme'
import { getAnimeTitleMode, setAnimeTitleMode, type AnimeTitleMode } from '../lib/titles'

const THEMES: [ThemeChoice, string][] = [
  ['system', 'Automatisch'],
  ['light', 'Licht'],
  ['dark', 'Donker'],
]

const ANIME_TITLES: [AnimeTitleMode, string, string][] = [
  ['both', 'Japans (Engels)', "Sousou no Frieren (Frieren: Beyond Journey's End)"],
  ['japanese', 'Japans', 'Sousou no Frieren'],
  ['english', 'Engels', "Frieren: Beyond Journey's End"],
]

export default function Settings() {
  const { session } = useAuth()
  const [theme, setThemeState] = useState(getTheme)
  const [animeTitles, setAnimeTitlesState] = useState(getAnimeTitleMode)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function restore(file: File) {
    if (!confirm('Back-up terugzetten? Titels uit de back-up worden toegevoegd of bijgewerkt. Titels die er niet in staan blijven gewoon staan.')) return
    setBusy('restore')
    setMessage(null)
    try {
      const count = await restoreJsonBackup(file)
      setMessage({ ok: true, text: `Teruggezet: ${count} ${count === 1 ? 'titel' : 'titels'}.` })
    } catch (e) {
      setMessage({ ok: false, text: `Terugzetten mislukt: ${e instanceof Error ? e.message : String(e)}` })
    }
    setBusy(null)
  }

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

      <Section title="Anime-titels" description="Als er geen Engelse titel bestaat, zie je altijd de Japanse.">
        <div className="space-y-1.5">
          {ANIME_TITLES.map(([key, label, example]) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 rounded-md px-1 py-1.5">
              <input
                type="radio"
                name="anime-titles"
                checked={animeTitles === key}
                onChange={() => {
                  setAnimeTitleMode(key)
                  setAnimeTitlesState(key)
                }}
                className="mt-1 size-4 accent-accent"
              />
              <span>
                <span className="block text-sm">{label}</span>
                <span className="block text-xs text-muted">{example}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section
        title="Back-up"
        description="Download je hele lijst, inclusief cijfers, notities, labels, bekeken afleveringen en kijkgeschiedenis. Met een .json-back-up kun je alles later weer terugzetten."
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
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className="rounded-md border border-line px-4 py-2 text-sm text-muted hover:text-fg disabled:opacity-50"
          >
            {busy === 'restore' ? 'Bezig met terugzetten…' : 'Back-up terugzetten'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) restore(file)
            }}
          />
        </div>
        {message && <p className={`text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
      </Section>

      <Section
        title="Meldingen"
        description="Een melding op dit apparaat als er een nieuwe aflevering uit is van een serie of anime die je volgt."
      >
        <PushSettings />
      </Section>

      <Section
        title="Lijst delen"
        description="Een link waarmee anderen je lijst of top 10 kunnen bekijken, zonder account. Notities en labels zijn niet te zien."
      >
        <ShareSettings />
      </Section>

      <Section title="Account" description={session?.user.email ? `Ingelogd als ${session.user.email}` : undefined}>
        <div className="space-y-1.5">
          <p className="text-sm">Wachtwoord wijzigen</p>
          <PasswordForm />
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-md border border-line px-4 py-2 text-sm text-bad hover:border-bad/60"
        >
          Uitloggen
        </button>
      </Section>

      <p className="text-xs text-muted">Versie {__APP_VERSION__}</p>
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
