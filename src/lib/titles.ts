import type { MediaType } from './types'

// Hoe anime-titels getoond worden. Bij anime is `title` de Engelse titel (als die bestaat)
// en `original_title` de Japanse titel in Latijnse letters.
export type AnimeTitleMode = 'both' | 'japanese' | 'english'

const KEY = 'anime-titles'

let mode: AnimeTitleMode = read()

function read(): AnimeTitleMode {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'japanese' || value === 'english' ? value : 'both'
  } catch {
    return 'both'
  }
}

export function getAnimeTitleMode() {
  return mode
}

export function setAnimeTitleMode(next: AnimeTitleMode) {
  mode = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Zonder opslag geldt de keuze alleen tot je de app sluit
  }
}

interface Titled {
  media_type: MediaType
  title: string
  original_title: string | null
}

// Bijv. "Sousou no Frieren (Frieren: Beyond Journey's End)"
export function displayTitle(item: Titled) {
  if (item.media_type !== 'anime' || !item.original_title) return item.title
  if (mode === 'english') return item.title
  if (mode === 'japanese') return item.original_title
  return `${item.original_title} (${item.title})`
}

// De titel die niet al in displayTitle staat, om klein onder de hoofdtitel te tonen
export function secondaryTitle(item: Titled) {
  if (!item.original_title) return null
  if (item.media_type !== 'anime') return item.original_title
  if (mode === 'english') return item.original_title
  if (mode === 'japanese') return item.title
  return null
}
