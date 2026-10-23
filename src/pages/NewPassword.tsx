import { useState } from 'react'
import { Link } from 'react-router-dom'
import PasswordForm from '../components/PasswordForm'

// Hier kom je terecht via de link in de mail van "Wachtwoord vergeten"
export default function NewPassword() {
  const [done, setDone] = useState(false)
  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Nieuw wachtwoord</h1>
      <p className="text-sm text-muted">Kies een nieuw wachtwoord voor je account.</p>
      <PasswordForm onDone={() => setDone(true)} />
      {done && (
        <Link to="/" className="inline-block text-sm text-accent-hover hover:underline">
          Naar je lijst
        </Link>
      )}
    </div>
  )
}
