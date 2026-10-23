import { mapTmdbResults, tmdb, type CatalogResult, type TmdbSearchItem } from './catalog'
import { minimalResult } from './franchise'
import { jikan } from './jikan'
import type { Source, WatchlistItem } from './types'

export interface Person {
  id: string
  source: Source
  name: string
  image: string | null
  // Rol of functie, bijv. "Walter White" of "Regie"
  role: string
}

const PROFILE = 'https://image.tmdb.org/t/p/w185'

const JOBS: Record<string, string> = {
  Director: 'Regie',
  Screenplay: 'Scenario',
  Writer: 'Schrijver',
  Novel: 'Boek',
  Creator: 'Bedenker',
  'Original Creator': 'Origineel werk',
  'Series Composition': 'Scenario',
  Music: 'Muziek',
  'Original Music Composer': 'Muziek',
  'Character Design': 'Karakterontwerp',
}

// Personen die meerdere functies hebben maar één keer tonen
function merge(people: Person[]) {
  const byId = new Map<string, Person>()
  for (const p of people) {
    const existing = byId.get(p.id)
    if (!existing) byId.set(p.id, { ...p })
    else if (!existing.role.split(', ').includes(p.role)) existing.role += `, ${p.role}`
  }
  return [...byId.values()]
}

export async function loadCredits(item: Pick<WatchlistItem, 'source' | 'media_type' | 'external_id'>) {
  const id = item.external_id
  if (item.source === 'tmdb' && item.media_type === 'movie') {
    const data = await tmdb<{
      cast: { id: number; name: string; profile_path: string | null; character: string }[]
      crew: { id: number; name: string; profile_path: string | null; job: string }[]
    }>(`movie/${id}/credits`)
    return {
      cast: data.cast.slice(0, 15).map((c) => tmdbPerson(c, c.character)),
      crew: merge(data.crew.filter((c) => JOBS[c.job]).map((c) => tmdbPerson(c, JOBS[c.job]))).slice(0, 6),
    }
  }
  if (item.source === 'tmdb') {
    const [credits, show] = await Promise.all([
      tmdb<{
        cast: { id: number; name: string; profile_path: string | null; roles: { character: string; episode_count: number }[] }[]
      }>(`tv/${id}/aggregate_credits`),
      tmdb<{ created_by?: { id: number; name: string; profile_path: string | null }[] }>(`tv/${id}`),
    ])
    return {
      cast: credits.cast.slice(0, 15).map((c) => tmdbPerson(c, c.roles[0]?.character ?? '')),
      crew: (show.created_by ?? []).map((c) => tmdbPerson(c, 'Bedenker')),
    }
  }

  // Anime: de Japanse stemacteurs bij de personages, en de belangrijkste makers
  const characters = await jikan<{
    data: {
      role: string
      character: { name: string }
      voice_actors: { language: string; person: { mal_id: number; name: string; images: { jpg: { image_url: string | null } } } }[]
    }[]
  }>(`anime/${id}/characters`)
  const staff = await jikan<{
    data: { person: { mal_id: number; name: string; images: { jpg: { image_url: string | null } } }; positions: string[] }[]
  }>(`anime/${id}/staff`)
  const cast = characters.data
    .sort((a, b) => Number(b.role === 'Main') - Number(a.role === 'Main'))
    .flatMap((c) => {
      const va = c.voice_actors.find((v) => v.language === 'Japanese')
      return va ? [jikanPerson(va.person, flipName(c.character.name))] : []
    })
  const crew = staff.data.flatMap((s) =>
    s.positions.filter((p) => JOBS[p]).map((p) => jikanPerson(s.person, JOBS[p])),
  )
  return { cast: merge(cast).slice(0, 15), crew: merge(crew).slice(0, 6) }
}

function tmdbPerson(p: { id: number; name: string; profile_path: string | null }, role: string): Person {
  return { id: String(p.id), source: 'tmdb', name: p.name, image: p.profile_path ? PROFILE + p.profile_path : null, role }
}

function jikanPerson(p: { mal_id: number; name: string; images: { jpg: { image_url: string | null } } }, role: string): Person {
  const image = p.images.jpg.image_url
  // MyAnimeList gebruikt een vast plaatje als er geen foto is
  return { id: String(p.mal_id), source: 'jikan', name: flipName(p.name), image: image?.includes('questionmark') ? null : image, role }
}

// MyAnimeList schrijft namen als "Achternaam, Voornaam"
function flipName(name: string) {
  const [last, first] = name.split(', ')
  return first ? `${first} ${last}` : name
}

export interface PersonCredit {
  result: CatalogResult
  role: string
  popularity: number
}

export interface PersonDetails {
  name: string
  image: string | null
  known_for: string | null
  credits: PersonCredit[]
}

// Een persoon met alles waar die aan meewerkte, om te vergelijken met je eigen lijst
export async function loadPerson(source: Source, id: string): Promise<PersonDetails> {
  if (source === 'tmdb') {
    type Credit = TmdbSearchItem & { character?: string; job?: string; popularity?: number }
    const [person, credits] = await Promise.all([
      tmdb<{ name: string; profile_path: string | null; known_for_department: string | null }>(`person/${id}`),
      tmdb<{ cast: Credit[]; crew: Credit[] }>(`person/${id}/combined_credits`),
    ])
    const all = [...credits.cast, ...credits.crew].filter((c) => c.media_type === 'movie' || c.media_type === 'tv')
    const byTitle = new Map<string, PersonCredit>()
    for (const c of all) {
      const key = `${c.media_type}:${c.id}`
      const role = c.character || (c.job ? (JOBS[c.job] ?? c.job) : '')
      const existing = byTitle.get(key)
      if (existing) {
        if (role && !existing.role.includes(role)) existing.role = existing.role ? `${existing.role}, ${role}` : role
        continue
      }
      byTitle.set(key, { result: mapTmdbResults([c])[0], role, popularity: c.popularity ?? 0 })
    }
    const departments: Record<string, string> = { Acting: 'Acteur', Directing: 'Regisseur', Writing: 'Schrijver', Production: 'Producent' }
    return {
      name: person.name,
      image: person.profile_path ? PROFILE + person.profile_path : null,
      known_for: person.known_for_department ? (departments[person.known_for_department] ?? person.known_for_department) : null,
      credits: [...byTitle.values()],
    }
  }

  type Anime = { mal_id: number; title: string; images: { jpg: { image_url: string | null } } }
  const { data } = await jikan<{
    data: {
      name: string
      images: { jpg: { image_url: string | null } }
      anime: { position: string; anime: Anime }[]
      voices: { role: string; anime: Anime; character: { name: string } }[]
    }
  }>(`people/${id}/full`)
  const byTitle = new Map<string, PersonCredit>()
  const add = (anime: Anime, role: string, order: number) => {
    const existing = byTitle.get(String(anime.mal_id))
    if (existing) {
      if (!existing.role.includes(role)) existing.role += `, ${role}`
      return
    }
    byTitle.set(String(anime.mal_id), { result: minimalResult(anime.mal_id, anime.title, anime.images.jpg.image_url), role, popularity: -order })
  }
  data.voices.forEach((v, i) => add(v.anime, flipName(v.character.name), i))
  data.anime.forEach((a, i) => add(a.anime, (JOBS[a.position.replace(/^add /, '')] ?? a.position), data.voices.length + i))
  const image = data.images.jpg.image_url
  return {
    name: flipName(data.name),
    image: image?.includes('questionmark') ? null : image,
    known_for: data.voices.length > 0 ? 'Stemacteur' : null,
    credits: [...byTitle.values()],
  }
}
