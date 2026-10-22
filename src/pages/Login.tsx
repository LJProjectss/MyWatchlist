import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'signup'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(translateError(error.message))
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) setError(translateError(error.message))
      else if (!data.session) setInfo('Check je mail en klik op de bevestigingslink om je account te activeren.')
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src="/favicon.svg" alt="" className="size-12" />
          <h1 className="text-2xl font-semibold tracking-tight">MyWatchlist</h1>
          <p className="text-sm text-muted">Houd bij wat je kijkt, waar je bent en wat je ervan vond.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-line bg-panel p-6">
          <label className="block space-y-1.5">
            <span className="text-sm text-muted">E-mailadres</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-muted">Wachtwoord</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-accent"
            />
          </label>

          {error && <p className="text-sm text-bad">{error}</p>}
          {info && <p className="text-sm text-good">{info}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-accent py-2 font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
          >
            {mode === 'login' ? 'Inloggen' : 'Account aanmaken'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          {mode === 'login' ? 'Nog geen account?' : 'Al een account?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setError(null)
              setInfo(null)
            }}
            className="text-accent-hover hover:underline"
          >
            {mode === 'login' ? 'Registreren' : 'Inloggen'}
          </button>
        </p>
      </div>
    </div>
  )
}

function translateError(message: string) {
  if (message.includes('Invalid login credentials')) return 'E-mailadres of wachtwoord klopt niet.'
  if (message.includes('Email not confirmed')) return 'Bevestig eerst je e-mailadres via de link in je mail.'
  if (message.includes('User already registered')) return 'Er bestaat al een account met dit e-mailadres.'
  if (/fetch|network/i.test(message))
    return 'Kan Supabase niet bereiken. Controleer VITE_SUPABASE_URL in Netlify (bijv. https://abcdefgh.supabase.co) en of een adblocker het verzoek tegenhoudt.'
  return message
}
