import { supabase } from './supabase'
import type { MediaType, WatchStatus } from './types'

export type ShareKind = 'list' | 'top10'

export interface Share {
  token: string
  kind: ShareKind
  name: string | null
}

export interface SharedItem {
  title: string
  original_title: string | null
  media_type: MediaType
  poster_url: string | null
  year: number | null
  status: WatchStatus
  rating: number | null
}

export const shareUrl = (token: string) => `${location.origin}/delen/${token}`

export async function loadShares() {
  const { data, error } = await supabase.from('shares').select('token, kind, name')
  if (error) throw new Error(error.message)
  return data as Share[]
}

export async function createShare(kind: ShareKind, name: string | null) {
  const { data, error } = await supabase.from('shares').insert({ kind, name }).select('token, kind, name').single()
  if (error) throw new Error(error.message)
  return data as Share
}

export async function renameShares(name: string | null) {
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('shares').update({ name }).eq('user_id', auth.user?.id)
  if (error) throw new Error(error.message)
}

// Een link uitzetten maakt hem meteen onbruikbaar; een nieuwe link krijgt een ander adres
export async function deleteShare(token: string) {
  const { error } = await supabase.from('shares').delete().eq('token', token)
  if (error) throw new Error(error.message)
}

// Werkt zonder account: de database geeft alleen titels, status en cijfers terug
export async function loadSharedList(token: string) {
  const { data, error } = await supabase.rpc('shared_list', { share_token: token })
  if (error) throw new Error(error.message)
  return data as { kind: ShareKind; name: string | null; items: SharedItem[] } | null
}
