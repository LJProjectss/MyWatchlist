import type { EpisodeRef } from './episodes'
import { writeEpisodes } from './episodes'
import { writeCompletion } from './history'
import { supabase } from './supabase'
import type { WatchlistItem } from './types'

// Wijzigingen die nog niet opgeslagen konden worden omdat je offline was. Ze staan op het apparaat
// en worden op volgorde verstuurd zodra er weer verbinding is, ook als je de app tussendoor sluit.
type Op =
  | { kind: 'episodes'; itemId: string; watchNumber: number; episodes: EpisodeRef[]; watched: boolean }
  | { kind: 'update'; itemId: string; changes: Partial<WatchlistItem> }
  | { kind: 'completion'; itemId: string; date: string }

const KEY = 'mywatchlist-pending'
const listeners = new Set<() => void>()
let pending: Op[] = read()

function read(): Op[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(pending))
  } catch {
    // Zonder opslag blijven de wijzigingen alleen bewaard zolang de app open is
  }
  listeners.forEach((fn) => fn())
}

export const pendingCount = () => pending.length

export function onPendingChange(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function isNetworkError(error: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error)
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(message)
}

// Probeert het meteen; lukt dat niet door een verbindingsprobleem, dan komt het in de wachtrij.
// Staat er al iets in de wachtrij, dan sluit het achteraan aan zodat de volgorde klopt.
export async function attempt(op: Op) {
  if (pending.length > 0 || !navigator.onLine) {
    enqueue(op)
    return
  }
  try {
    await run(op)
  } catch (error) {
    if (!isNetworkError(error)) throw error
    enqueue(op)
  }
}

function enqueue(op: Op) {
  pending = [...pending, op]
  save()
}

async function run(op: Op) {
  if (op.kind === 'episodes') return writeEpisodes(op.itemId, op.watchNumber, op.episodes, op.watched)
  if (op.kind === 'completion') return writeCompletion(op.itemId, op.date)
  const { error } = await supabase.from('watchlist_items').update(op.changes).eq('id', op.itemId)
  if (error) throw new Error(error.message)
}

let syncing: Promise<void> | null = null

// Alles uit de wachtrij versturen. Stopt bij een verbindingsprobleem en probeert het later opnieuw.
export function syncPending() {
  if (pending.length === 0) return Promise.resolve()
  syncing ??= (async () => {
    while (pending.length > 0) {
      try {
        await run(pending[0])
      } catch (error) {
        if (isNetworkError(error)) break
        // Bijv. een titel die inmiddels verwijderd is: overslaan, anders blijft de rest hangen
        console.warn('Offline wijziging overgeslagen:', error)
      }
      pending = pending.slice(1)
      save()
    }
  })().finally(() => {
    syncing = null
  })
  return syncing
}

export function updateItem(itemId: string, changes: Partial<WatchlistItem>) {
  return attempt({ kind: 'update', itemId, changes })
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void syncPending())
  // Ook periodiek, want het "online"-signaal komt niet op elk toestel betrouwbaar door
  window.setInterval(() => navigator.onLine && void syncPending(), 30_000)
}
