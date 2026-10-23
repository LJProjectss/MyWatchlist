import { useEffect, useState } from 'react'
import { tmdb } from '../lib/catalog'
import { jikan } from '../lib/jikan'
import type { WatchlistItem } from '../lib/types'

interface TmdbVideo {
  key: string
  site: string
  type: string
  iso_639_1: string
  official: boolean
}

// YouTube-ID van de beste trailer: Nederlands boven Engels, officieel boven de rest
async function findTrailer(item: Pick<WatchlistItem, 'source' | 'media_type' | 'external_id'>): Promise<string | null> {
  if (item.source === 'tmdb') {
    const { results } = await tmdb<{ results: TmdbVideo[] }>(`${item.media_type}/${item.external_id}/videos`, {
      include_video_language: 'nl,en,null',
    })
    const score = (v: TmdbVideo) =>
      (v.type === 'Trailer' ? 4 : v.type === 'Teaser' ? 2 : 0) + (v.iso_639_1 === 'nl' ? 2 : 0) + (v.official ? 1 : 0)
    const best = results.filter((v) => v.site === 'YouTube' && ['Trailer', 'Teaser'].includes(v.type)).sort((a, b) => score(b) - score(a))[0]
    return best?.key ?? null
  }
  // Via de wachtrij, want deze pagina doet meer verzoeken aan MyAnimeList tegelijk
  const { data } = await jikan<{ data: { trailer?: { youtube_id: string | null; embed_url: string | null } } }>(
    `anime/${item.external_id}`,
  )
  return data.trailer?.youtube_id ?? data.trailer?.embed_url?.match(/embed\/([\w-]{11})/)?.[1] ?? null
}

export default function Trailer({ item }: { item: WatchlistItem }) {
  const [video, setVideo] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  const { source, media_type, external_id } = item

  useEffect(() => {
    let cancelled = false
    findTrailer({ source, media_type, external_id })
      .then((id) => !cancelled && setVideo(id))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [source, media_type, external_id])

  // Geen trailer gevonden: het blok helemaal weglaten
  if (!video) return null

  return (
    <section className="space-y-2">
      <h2 className="text-sm text-muted">Trailer</h2>
      <div className="relative aspect-video w-full max-w-xl overflow-hidden rounded-lg bg-black">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video}?autoplay=1&rel=0`}
            title="Trailer"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full"
          />
        ) : (
          // Pas laden als je erop tikt: scheelt data en YouTube weet niets tot je kijkt
          <button onClick={() => setPlaying(true)} aria-label="Trailer afspelen" className="group absolute inset-0">
            <img src={`https://i.ytimg.com/vi/${video}/hqdefault.jpg`} alt="" className="size-full object-cover opacity-80 group-hover:opacity-100" />
            <span className="absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full bg-black/70 text-2xl text-white group-hover:bg-accent">
              ▶
            </span>
          </button>
        )}
      </div>
    </section>
  )
}
