export type MediaType = 'movie' | 'tv' | 'anime'
export type Source = 'tmdb' | 'jikan'
export type WatchStatus = 'watching' | 'completed' | 'plan_to_watch' | 'on_hold' | 'dropped'

export interface WatchlistItem {
  id: string
  user_id: string
  source: Source
  media_type: MediaType
  external_id: string
  imdb_id: string | null
  title: string
  original_title: string | null
  poster_url: string | null
  year: number | null
  total_episodes: number | null
  // Opgeslagen seizoensindeling, zodat het overzicht de volgende aflevering kan tonen zonder API-aanroep
  seasons: SeasonInfo[] | null
  status: WatchStatus
  rating: number | null
  // Cijfer per seizoensnummer; het seriecijfer is dan het gemiddelde hiervan
  season_ratings: Record<string, number> | null
  notes: string | null
  tags: string[]
  priority: Priority | null
  current_watch: number
  next_air: NextAir | null
  show_status: string | null
  info_refreshed_at: string | null
  runtime: number | null
  created_at: string
  updated_at: string
}

export type Priority = 1 | 2 | 3

export const PRIORITY_LABELS: Record<Priority, string> = { 1: 'Hoog', 2: 'Normaal', 3: 'Laag' }

// Eerstvolgende uitzending; voor anime zonder vaste datum alleen de uitzenddag
export interface NextAir {
  season_number: number
  episode_number: number
  air_date: string | null
  broadcast?: string | null
}

export interface WatchHistoryEntry {
  id: string
  item_id: string
  watched_on: string
}

export interface SeasonInfo {
  season_number: number
  name: string
  episode_count: number
}

export interface WatchedEpisode {
  id: string
  item_id: string
  season_number: number
  episode_number: number
  watched_at: string
}

export const STATUS_LABELS: Record<WatchStatus, string> = {
  watching: 'Aan het kijken',
  completed: 'Gekeken',
  plan_to_watch: 'Wil ik zien',
  on_hold: 'Gepauzeerd',
  dropped: 'Gestopt',
}

export const MEDIA_LABELS: Record<MediaType, string> = {
  movie: 'Film',
  tv: 'Serie',
  anime: 'Anime',
}

export function formatRating(rating: number) {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1).replace('.', ',')
}

// Gemiddelde van de seizoenscijfers met één decimaal, of null als er geen zijn
export function averageSeasonRating(ratings: Record<string, number> | null) {
  const values = Object.values(ratings ?? {})
  if (values.length === 0) return null
  return Math.round((values.reduce((sum, r) => sum + r, 0) / values.length) * 10) / 10
}
