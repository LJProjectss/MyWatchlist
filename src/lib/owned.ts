import { supabase } from './supabase'
import type { Source, WatchStatus } from './types'

export interface Owned {
  id: string
  status: WatchStatus
  rating: number | null
}

export const ownedKey = (mediaType: string, externalId: string) => `${mediaType}:${externalId}`

// Welke van deze titels staan al in je lijst?
export async function findOwned(source: Source, externalIds: string[]) {
  const map = new Map<string, Owned>()
  if (externalIds.length === 0) return map
  const { data, error } = await supabase
    .from('watchlist_items')
    .select('id, status, rating, media_type, external_id')
    .eq('source', source)
    .in('external_id', [...new Set(externalIds)])
  if (error) throw new Error(error.message)
  for (const row of data) map.set(ownedKey(row.media_type, row.external_id), row)
  return map
}
