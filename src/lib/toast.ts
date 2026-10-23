// Korte melding onderin het scherm, eventueel met "Ongedaan maken". Blijft staan als je van pagina wisselt.
export interface Toast {
  text: string
  undo?: () => Promise<void>
  // Tekst op de knop; standaard "Ongedaan maken"
  actionLabel?: string
}

let current: Toast | null = null
let timer: number | undefined
const listeners = new Set<(toast: Toast | null) => void>()

function set(next: Toast | null) {
  current = next
  listeners.forEach((fn) => fn(current))
}

export function showToast(toast: Toast, ms = 5000) {
  set(toast)
  window.clearTimeout(timer)
  timer = window.setTimeout(() => set(null), ms)
}

export function hideToast() {
  window.clearTimeout(timer)
  set(null)
}

export function onToast(fn: (toast: Toast | null) => void) {
  listeners.add(fn)
  fn(current)
  return () => {
    listeners.delete(fn)
  }
}
