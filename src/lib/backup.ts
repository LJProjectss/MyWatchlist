import { supabase } from './supabase'
import { MEDIA_LABELS, STATUS_LABELS, type WatchlistItem } from './types'

// Supabase geeft maximaal 1000 rijen per keer terug, dus we halen alles in stukken op
async function fetchAll<T>(table: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data as T[]))
    if (data.length < 1000) return rows
  }
}

export async function downloadJsonBackup() {
  const [items, episodes, history] = await Promise.all([
    fetchAll<WatchlistItem>('watchlist_items'),
    fetchAll('watched_episodes'),
    fetchAll('watch_history'),
  ])
  const backup = {
    app: 'MyWatchlist',
    exported_at: new Date().toISOString(),
    watchlist_items: items,
    watched_episodes: episodes,
    watch_history: history,
  }
  save(`mywatchlist-backup-${today()}.json`, JSON.stringify(backup, null, 2), 'application/json')
  return items.length
}

// Leesbaar overzicht, te openen in Excel of Google Sheets
export async function downloadCsv() {
  const items = await fetchAll<WatchlistItem>('watchlist_items')
  const header = ['Titel', 'Originele titel', 'Soort', 'Jaar', 'Status', 'Cijfer', 'Labels', 'Notities', 'IMDb', 'Toegevoegd']
  const rows = items.map((i) => [
    i.title,
    i.original_title ?? '',
    MEDIA_LABELS[i.media_type],
    i.year ?? '',
    STATUS_LABELS[i.status],
    i.rating === null ? '' : String(i.rating).replace('.', ','),
    (i.tags ?? []).join(', '),
    i.notes ?? '',
    i.imdb_id ? `https://www.imdb.com/title/${i.imdb_id}/` : '',
    i.created_at.slice(0, 10),
  ])
  // Puntkomma's en een BOM zodat Nederlandse Excel het meteen goed opent
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  save(`mywatchlist-${today()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8')
  return items.length
}

function save(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}
