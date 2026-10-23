import { cacheAddItem, cacheRemoveItem } from './cache'
import { selectAll, supabase } from './supabase'
import type { WatchlistItem } from './types'

// Alles wat bij een titel hoort, zodat verwijderen ongedaan gemaakt kan worden
export interface DeletedItems {
  items: WatchlistItem[]
  episodes: Record<string, unknown>[]
  history: Record<string, unknown>[]
  reviews: Record<string, unknown>[]
}

const RELATED = { episodes: 'watched_episodes', history: 'watch_history', reviews: 'episode_reviews' } as const

function chunks<T>(list: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// Eerst alles bewaren, dan verwijderen (afleveringen, geschiedenis en cijfers gaan automatisch mee)
export async function deleteItems(items: WatchlistItem[]): Promise<DeletedItems> {
  const ids = items.map((i) => i.id)
  const deleted: DeletedItems = { items, episodes: [], history: [], reviews: [] }
  for (const part of chunks(ids, 50)) {
    for (const [key, table] of Object.entries(RELATED) as [keyof typeof RELATED, string][]) {
      deleted[key].push(...(await selectAll<Record<string, unknown>>(table, '*', (q) => q.in('item_id', part))))
    }
    const { error } = await supabase.from('watchlist_items').delete().in('id', part)
    if (error) throw new Error(error.message)
  }
  ids.forEach(cacheRemoveItem)
  return deleted
}

// Terugzetten met dezelfde ID's, zodat links en voortgang precies kloppen zoals ze waren
export async function restoreItems(deleted: DeletedItems) {
  for (const part of chunks(deleted.items, 500)) {
    const { error } = await supabase.from('watchlist_items').insert(part)
    if (error) throw new Error(error.message)
  }
  for (const [key, table] of Object.entries(RELATED) as [keyof typeof RELATED, string][]) {
    for (const part of chunks(deleted[key], 500)) {
      const { error } = await supabase.from(table).insert(part)
      if (error) throw new Error(error.message)
    }
  }
  deleted.items.forEach(cacheAddItem)
  // Open lijsten laten de teruggezette titels meteen zien
  window.dispatchEvent(new CustomEvent('items-restored', { detail: deleted }))
}
