import { localDate } from './history'
import type { WatchStatus, WatchlistItem } from './types'

export const PAUSED: WatchStatus[] = ['on_hold', 'dropped']

export const REMIND_OPTIONS: [number, string][] = [
  [0, 'Niet herinneren'],
  [1, 'Over 1 maand'],
  [3, 'Over 3 maanden'],
  [6, 'Over 6 maanden'],
  [12, 'Over 1 jaar'],
]

export function monthsFromNow(months: number) {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return localDate(d)
}

// Bij gepauzeerd standaard over een maand een seintje; bij gestopt alleen als je dat zelf kiest
export function statusChanges(item: WatchlistItem, status: WatchStatus): Partial<WatchlistItem> {
  if (status === item.status) return { status }
  if (PAUSED.includes(status)) {
    // Van gepauzeerd naar gestopt (of andersom): datum en herinnering blijven staan
    if (PAUSED.includes(item.status)) return { status }
    return {
      status,
      paused_at: new Date().toISOString(),
      remind_at: status === 'on_hold' ? monthsFromNow(1) : null,
    }
  }
  return { status, remind_at: null }
}

export function dueReminders(items: WatchlistItem[]) {
  const today = localDate()
  return items.filter((i) => PAUSED.includes(i.status) && i.remind_at && i.remind_at <= today)
}

export function formatSince(date: string) {
  return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}
