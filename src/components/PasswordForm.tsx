import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

// Nieuw wachtwoord instellen, na "Wachtwoord vergeten" of vanuit Instellingen
export default function PasswordForm({ onDone }: { onDone?: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setMessage({
        ok: false,
        text: error.message.includes('different from the old')
          ? 'Kies een ander wachtwoord dan je huidige.'
          : `Opslaan mislukt: ${error.message}`,
      })
      return
    }
    setPassword('')
    setMessage({ ok: true, text: 'Je nieuwe wachtwoord is opgeslagen.' })
    onDone?.()
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Nieuw wachtwoord (minstens 6 tekens)"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? 'Bezig…' : 'Opslaan'}
        </button>
      </div>
      {message && <p className={`text-sm ${message.ok ? 'text-good' : 'text-bad'}`}>{message.text}</p>}
    </form>
  )
}
