import { useEffect, useState } from 'react'
import { onPendingChange, pendingCount, syncPending } from '../lib/offline'

// Laat zien dat je offline bent en hoeveel wijzigingen nog wachten om opgeslagen te worden
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [count, setCount] = useState(pendingCount)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    const unsubscribe = onPendingChange(() => setCount(pendingCount()))
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      unsubscribe()
    }
  }, [])

  if (online && count === 0) return null
  const changes = `${count} ${count === 1 ? 'wijziging' : 'wijzigingen'}`
  return (
    <div className="border-b border-line bg-panel">
      <p className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm sm:px-6">
        <span className={`size-2 shrink-0 rounded-full ${online ? 'bg-amber-500' : 'bg-muted'}`} />
        {online ? (
          <>
            <span className="flex-1">{changes} van toen je offline was worden opgeslagen…</span>
            <button onClick={() => void syncPending()} className="text-accent-hover hover:underline">
              Nu opslaan
            </button>
          </>
        ) : (
          <span className="flex-1">
            Je bent offline. Afvinken werkt gewoon{count > 0 ? ` (${changes} wachten)` : ''}; het wordt opgeslagen zodra je
            weer online bent.
          </span>
        )}
      </p>
    </div>
  )
}
