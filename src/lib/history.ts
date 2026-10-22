import { supabase } from './supabase'
import type { WatchHistoryEntry } from './types'

export async function loadHistory(itemId: string): Promise<WatchHistoryEntry[]> {
  const { data, error } = await supabase
    .from('watch_history')
    .select('id, item_id, watched_on')
    .eq('item_id', itemId)
    .order('watched_on', { ascending: false })
  if (error) throw new Error(error.message)
  return data as WatchHistoryEntry[]
}

export async function addHistory(itemId: string, watchedOn: string) {
  const { error } = await supabase.from('watch_history').insert({ item_id: itemId, watched_on: watchedOn })
  if (error) throw new Error(error.message)
}

export async function deleteHistory(id: string) {
  const { error } = await supabase.from('watch_history').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Bij het afronden van een titel de datum van vandaag vastleggen (niet dubbel op dezelfde dag)
export async function recordCompletion(itemId: string) {
  const today = localDate()
  const { data } = await supabase
    .from('watch_history')
    .select('id')
    .eq('item_id', itemId)
    .eq('watched_on', today)
    .limit(1)
  if (data && data.length > 0) return
  await addHistory(itemId, today)
}

export function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}
