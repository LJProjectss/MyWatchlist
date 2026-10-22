import type { WatchlistItem } from './types'

// Laatst bekende lijst en voortgang, zodat pagina's direct iets tonen en op de achtergrond verversen.
// Ook bewaard op het apparaat, zodat de app na het (her)openen meteen je lijst laat zien.
const KEY = 'mywatchlist-cache'

interface Snapshot {
  userId: string
  items: WatchlistItem[]
  watched: Record<string, string[]>
}

let userId: string | null = null
let items: WatchlistItem[] | null = null
let watched: Map<string, Set<string>> | null = null

export function setCacheUser(id: string | null) {
  if (id === userId) return
  userId = id
  items = null
  watched = null
  if (!id) {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // niets te doen
    }
    return
  }
  try {
    const snapshot: Snapshot = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (snapshot?.userId === id) {
      items = snapshot.items
      watched = new Map(Object.entries(snapshot.watched).map(([k, v]) => [k, new Set(v)]))
    }
  } catch {
    // Kapotte of ontbrekende cache: gewoon opnieuw laden
  }
}

export const getCachedItems = () => items
export const getCachedWatched = () => watched
export const getCachedItem = (id: string | undefined) => items?.find((i) => i.id === id) ?? null

export function cacheItems(next: WatchlistItem[]) {
  items = next
  persist()
}

export function cacheWatched(next: Map<string, Set<string>>) {
  watched = next
  persist()
}

export function cacheItemChanges(id: string, changes: Partial<WatchlistItem>) {
  if (!items) return
  items = items.map((i) => (i.id === id ? { ...i, ...changes } : i))
  persist()
}

export function cacheItemWatched(id: string, set: Set<string>) {
  watched = new Map(watched ?? []).set(id, set)
  persist()
}

export function cacheAddItem(item: WatchlistItem) {
  if (!items) return
  items = [item, ...items.filter((i) => i.id !== item.id)]
  persist()
}

export function cacheRemoveItem(id: string) {
  if (items) items = items.filter((i) => i.id !== id)
  persist()
}

let timer: number | undefined
function persist() {
  // Bundelen: bij snel afvinken niet bij elke tik alles opnieuw wegschrijven
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    if (!userId || !items) return
    const snapshot: Snapshot = {
      userId,
      items,
      watched: Object.fromEntries([...(watched ?? new Map())].map(([k, v]) => [k, [...v]])),
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot))
    } catch {
      // Opslag vol of uitgeschakeld: de cache werkt dan alleen zolang de app open is
    }
  }, 300)
}
