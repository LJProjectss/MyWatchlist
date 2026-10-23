import { selectAll, supabase } from './supabase'
import { MEDIA_LABELS, STATUS_LABELS, type WatchlistItem } from './types'

const fetchAll = <T,>(table: string) => selectAll<T>(table)

export async function downloadJsonBackup() {
  const [items, episodes, history, reviews] = await Promise.all([
    fetchAll<WatchlistItem>('watchlist_items'),
    fetchAll('watched_episodes'),
    fetchAll('watch_history'),
    fetchAll('episode_reviews'),
  ])
  const backup = {
    app: 'MyWatchlist',
    exported_at: new Date().toISOString(),
    watchlist_items: items,
    watched_episodes: episodes,
    watch_history: history,
    episode_reviews: reviews,
  }
  save(`mywatchlist-backup-${today()}.json`, JSON.stringify(backup, null, 2), 'application/json')
  return items.length
}

type Row = Record<string, unknown>

// Een volledige back-up terugzetten. Titels uit de back-up worden toegevoegd, of bijgewerkt als
// ze al in je lijst staan; titels die niet in de back-up staan blijven gewoon staan.
// Werkt ook op een ander account, omdat titels aan bron en ID worden herkend.
export async function restoreJsonBackup(file: File) {
  let backup: { app?: string; watchlist_items?: Row[]; watched_episodes?: Row[]; watch_history?: Row[]; episode_reviews?: Row[] }
  try {
    backup = JSON.parse(await file.text())
  } catch {
    throw new Error('Dit is geen geldig back-upbestand.')
  }
  if (backup.app !== 'MyWatchlist' || !Array.isArray(backup.watchlist_items)) {
    throw new Error('Dit bestand is geen back-up van MyWatchlist.')
  }

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('Je bent niet ingelogd.')

  // Titels opslaan en onthouden welk nieuw ID bij welk oud ID hoort
  const newIds = new Map<string, string>()
  const titleKey = (r: Row) => `${r.source}|${r.media_type}|${r.external_id}`
  const oldIds = new Map(backup.watchlist_items.map((r) => [titleKey(r), r.id as string]))
  for (const chunk of chunks(backup.watchlist_items)) {
    const rows = chunk.map(({ id: _id, user_id: _user, ...rest }) => ({ ...rest, user_id: userId }))
    const { data, error } = await supabase
      .from('watchlist_items')
      .upsert(rows, { onConflict: 'user_id,source,media_type,external_id' })
      .select('id, source, media_type, external_id')
    if (error) throw new Error(error.message)
    for (const r of data) newIds.set(oldIds.get(titleKey(r))!, r.id)
  }

  // Rijen die bij een titel horen aan het nieuwe ID koppelen
  const relink = (rows: Row[] | undefined) =>
    (rows ?? [])
      .filter((r) => newIds.has(r.item_id as string))
      .map(({ id: _id, user_id: _user, ...rest }): Row => ({ ...rest, user_id: userId, item_id: newIds.get(rest.item_id as string) }))

  for (const chunk of chunks(relink(backup.watched_episodes))) {
    const { error } = await supabase.from('watched_episodes').upsert(chunk, {
      onConflict: 'item_id,watch_number,season_number,episode_number',
      ignoreDuplicates: true,
    })
    if (error) throw new Error(error.message)
  }

  for (const chunk of chunks(relink(backup.episode_reviews))) {
    const { error } = await supabase.from('episode_reviews').upsert(chunk, { onConflict: 'item_id,season_number,episode_number' })
    if (error) throw new Error(error.message)
  }

  // Kijkgeschiedenis heeft geen unieke sleutel: alleen datums toevoegen die er nog niet zijn
  const existing = new Set((await fetchAll<Row>('watch_history')).map((r) => `${r.item_id}|${r.watched_on}`))
  const history = relink(backup.watch_history).filter((r) => !existing.has(`${r.item_id}|${r.watched_on}`))
  for (const chunk of chunks(history)) {
    const { error } = await supabase.from('watch_history').insert(chunk)
    if (error) throw new Error(error.message)
  }

  return newIds.size
}

function chunks<T>(rows: T[], size = 500) {
  const result: T[][] = []
  for (let i = 0; i < rows.length; i += size) result.push(rows.slice(i, i + size))
  return result
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
