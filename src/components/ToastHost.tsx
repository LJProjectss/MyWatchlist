import { useEffect, useState } from 'react'
import { hideToast, onToast, showToast, type Toast } from '../lib/toast'

export default function ToastHost() {
  const [toast, setToast] = useState<Toast | null>(null)
  useEffect(() => onToast(setToast), [])
  if (!toast) return null
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-sm shadow-lg md:bottom-6"
    >
      <span className="min-w-0 flex-1">{toast.text}</span>
      {toast.undo && (
        <button
          onClick={() => {
            const undo = toast.undo!
            hideToast()
            undo().catch((e) => showToast({ text: `${toast.actionLabel ?? 'Ongedaan maken'} mislukt: ${e instanceof Error ? e.message : String(e)}` }))
          }}
          className="shrink-0 font-medium text-accent-hover hover:underline"
        >
          {toast.actionLabel ?? 'Ongedaan maken'}
        </button>
      )}
    </div>
  )
}
