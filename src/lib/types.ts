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
  status: WatchStatus
  rating: number | null
  notes: string | null
  created_at: string
  updated_at: string
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
