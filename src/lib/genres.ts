// Genres in het Nederlands, hetzelfde voor TMDB en MyAnimeList, zodat filteren en statistieken
// over films, series en anime heen werken. TMDB-genres gaan op ID (taalonafhankelijk), Jikan op naam.
const TMDB: Record<number, string[]> = {
  28: ['Actie'],
  12: ['Avontuur'],
  10759: ['Actie', 'Avontuur'],
  16: ['Animatie'],
  35: ['Komedie'],
  80: ['Misdaad'],
  99: ['Documentaire'],
  18: ['Drama'],
  10751: ['Familie'],
  10762: ['Kinderen'],
  14: ['Fantasy'],
  878: ['Sciencefiction'],
  10765: ['Sciencefiction', 'Fantasy'],
  36: ['Geschiedenis'],
  27: ['Horror'],
  10402: ['Muziek'],
  9648: ['Mysterie'],
  10749: ['Romantiek'],
  53: ['Thriller'],
  10752: ['Oorlog'],
  10768: ['Oorlog', 'Politiek'],
  37: ['Western'],
  10763: ['Nieuws'],
  10764: ['Reality'],
  10766: ['Soap'],
  10767: ['Talkshow'],
}

const JIKAN: Record<string, string> = {
  Action: 'Actie',
  Adventure: 'Avontuur',
  Comedy: 'Komedie',
  Drama: 'Drama',
  Fantasy: 'Fantasy',
  Horror: 'Horror',
  Mystery: 'Mysterie',
  Romance: 'Romantiek',
  'Sci-Fi': 'Sciencefiction',
  'Slice of Life': 'Slice of life',
  Sports: 'Sport',
  Supernatural: 'Bovennatuurlijk',
  Suspense: 'Thriller',
  'Avant Garde': 'Avant-garde',
  Gourmet: 'Culinair',
  'Boys Love': 'Boys love',
  'Girls Love': 'Girls love',
  Ecchi: 'Ecchi',
}

export function tmdbGenres(genres: { id: number }[] | undefined): string[] {
  return unique((genres ?? []).flatMap((g) => TMDB[g.id] ?? []))
}

export function jikanGenres(genres: { name: string }[] | undefined): string[] {
  return unique((genres ?? []).flatMap((g) => (JIKAN[g.name] ? [JIKAN[g.name]] : [])))
}

// TMDB-score is 0 als niemand gestemd heeft; dat tonen we niet
export function score(value: number | null | undefined) {
  return value ? Math.round(value * 10) / 10 : null
}

function unique(list: string[]) {
  return [...new Set(list)]
}
