import { selectAll } from './supabase'
import type { WatchlistItem } from './types'

// Je hele lijst, ook boven de 1000 titels, laatst bijgewerkt eerst.
// Geeft { data, error } terug, net als een gewone Supabase-aanroep.
export async function loadItems(): Promise<{ data: WatchlistItem[] | null; error: { message: string } | null }> {
  try {
    const items = await selectAll<WatchlistItem>('watchlist_items')
    return { data: items.sort((a, b) => b.updated_at.localeCompare(a.updated_at)), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } }
  }
}
