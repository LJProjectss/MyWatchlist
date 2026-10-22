import { epKey, type EpisodeRef } from './episodes'
import { supabase } from './supabase'
import type { EpisodeReview } from './types'

export async function loadReviews(itemId: string) {
  const { data, error } = await supabase
    .from('episode_reviews')
    .select('season_number, episode_number, rating, note')
    .eq('item_id', itemId)
  if (error) throw new Error(error.message)
  return new Map((data as EpisodeReview[]).map((r) => [epKey(r.season_number, r.episode_number), r]))
}

// Leeg cijfer én lege notitie: dan verwijderen we de rij
export async function saveReview(itemId: string, ref: EpisodeRef, rating: number | null, note: string | null) {
  if (rating === null && !note) {
    const { error } = await supabase
      .from('episode_reviews')
      .delete()
      .eq('item_id', itemId)
      .eq('season_number', ref.season_number)
      .eq('episode_number', ref.episode_number)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await supabase
    .from('episode_reviews')
    .upsert(
      { item_id: itemId, ...ref, rating, note, updated_at: new Date().toISOString() },
      { onConflict: 'item_id,season_number,episode_number' },
    )
  if (error) throw new Error(error.message)
}

export function averageRating(reviews: EpisodeReview[]) {
  const values = reviews.map((r) => r.rating).filter((r): r is number => r !== null)
  if (values.length === 0) return null
  return Math.round((values.reduce((sum, r) => sum + r, 0) / values.length) * 10) / 10
}
