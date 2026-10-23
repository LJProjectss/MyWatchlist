import type { Config } from '@netlify/functions'
import { connect, send, type Subscription } from '../lib/push.mts'

// Draait elk uur: kijkt per gevolgde serie of anime of er een nieuwe aflevering uit is
// en stuurt dan één melding per aflevering naar je apparaten.

interface Followed {
  id: string
  user_id: string
  source: 'tmdb' | 'jikan'
  media_type: 'tv' | 'anime'
  external_id: string
  title: string
  current_watch: number
}

interface Aired {
  season_number: number
  episode_number: number
  air_date: string
  name: string | null
}

// Melden vanaf 06:00 UTC op de dag na de uitzending (dan is hij overal te zien),
// en niet meer voor afleveringen die al een paar dagen oud zijn
const DAY = 24 * 60 * 60 * 1000
function isDue(airDate: string, now = Date.now()) {
  const aired = Date.parse(`${airDate}T00:00:00Z`)
  return now >= aired + DAY + 6 * 60 * 60 * 1000 && now - aired < 4 * DAY
}

export default async () => {
  const db = await connect().catch((error) => {
    console.log(`[push] ${error.message}`)
    return null
  })
  if (!db) return

  try {
    const { rows: items } = await db.query<Followed>(`
      select i.id, i.user_id, i.source, i.media_type, i.external_id, i.title, i.current_watch
      from public.watchlist_items i
      where i.media_type <> 'movie'
        and i.status in ('watching', 'completed', 'on_hold')
        and (i.next_air is not null or i.show_status in ('Returning Series', 'In Production', 'Currently Airing'))
        and exists (select 1 from public.push_subscriptions s where s.user_id = i.user_id)`)

    // Dezelfde serie maar één keer opvragen, ook als meerdere mensen hem volgen
    const latest = new Map<string, Aired | null>()
    for (const item of items) {
      const key = `${item.source}:${item.external_id}`
      if (!latest.has(key)) latest.set(key, await latestEpisode(item).catch(() => null))
    }

    let sent = 0
    for (const item of items) {
      const ep = latest.get(`${item.source}:${item.external_id}`)
      if (!ep || !isDue(ep.air_date)) continue

      // Al gekeken (bijvoorbeeld direct bij het uitkomen)? Dan geen melding.
      const seen = await db.query(
        `select 1 from public.watched_episodes
         where item_id = $1 and watch_number = $2 and season_number = $3 and episode_number = $4`,
        [item.id, item.current_watch, ep.season_number, ep.episode_number],
      )
      if (seen.rowCount) continue

      const claimed = await db.query(
        `insert into private.push_sent (item_id, season_number, episode_number) values ($1, $2, $3)
         on conflict do nothing returning 1`,
        [item.id, ep.season_number, ep.episode_number],
      )
      if (!claimed.rowCount) continue

      // De app haalt de nieuwe afleveringen op zodra je hem opent
      await db.query('update public.watchlist_items set info_refreshed_at = null where id = $1', [item.id])

      const label = item.media_type === 'anime' ? `Afl. ${ep.episode_number}` : `S${ep.season_number} · A${ep.episode_number}`
      const { rows: subs } = await db.query<Subscription>(
        'select id, endpoint, p256dh, auth from public.push_subscriptions where user_id = $1',
        [item.user_id],
      )
      for (const sub of subs) {
        if (await send(db, sub, { title: item.title, body: `Nieuwe aflevering: ${label}${ep.name ? ` – ${ep.name}` : ''}`, url: `/titel/${item.id}` })) sent++
      }
    }
    // Herinneringen bij gepauzeerde of gestopte titels, 's ochtends (vanaf 07:00 UTC) op de gekozen dag
    if (new Date().getUTCHours() >= 7) {
      const { rows: due } = await db.query<{ id: string; user_id: string; title: string; status: string; pause_reason: string | null }>(`
        update public.watchlist_items i set reminder_pushed_at = now()
        where i.status in ('on_hold', 'dropped')
          and i.remind_at <= current_date
          and (i.reminder_pushed_at is null or i.reminder_pushed_at < i.remind_at)
          and exists (select 1 from public.push_subscriptions s where s.user_id = i.user_id)
        returning i.id, i.user_id, i.title, i.status, i.pause_reason`)
      for (const item of due) {
        const { rows: subs } = await db.query<Subscription>(
          'select id, endpoint, p256dh, auth from public.push_subscriptions where user_id = $1',
          [item.user_id],
        )
        const verb = item.status === 'dropped' ? 'gestopt' : 'gepauzeerd'
        const body = `Je was ${verb}${item.pause_reason ? ` (“${item.pause_reason}”)` : ''}. Zin om het opnieuw te proberen?`
        for (const sub of subs) if (await send(db, sub, { title: item.title, body, url: `/titel/${item.id}` })) sent++
      }
    }

    console.log(`[push] ${items.length} gevolgde titels gecontroleerd, ${sent} meldingen verstuurd.`)
  } finally {
    await db.end().catch(() => {})
  }
}

async function latestEpisode(item: Followed): Promise<Aired | null> {
  if (item.source === 'tmdb') {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${item.external_id}?language=nl-NL`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const last = (await res.json()).last_episode_to_air
    if (!last?.air_date) return null
    return { season_number: last.season_number, episode_number: last.episode_number, air_date: last.air_date, name: last.name || null }
  }

  // Jikan: de laatste pagina van de afleveringenlijst bevat de nieuwste aflevering
  const first = await jikan(`anime/${item.external_id}/episodes`)
  const lastPage = first?.pagination?.last_visible_page ?? 1
  const page = lastPage > 1 ? await jikan(`anime/${item.external_id}/episodes?page=${lastPage}`) : first
  const episodes: { mal_id: number; title: string | null; aired: string | null }[] = page?.data ?? []
  const last = episodes.filter((e) => e.aired).at(-1)
  if (!last) return null
  return { season_number: 1, episode_number: last.mal_id, air_date: last.aired!.slice(0, 10), name: last.title }
}

// Jikan staat maximaal 3 verzoeken per seconde toe
async function jikan(path: string) {
  await new Promise((resolve) => setTimeout(resolve, 400))
  const res = await fetch(`https://api.jikan.moe/v4/${path}`)
  return res.ok ? res.json() : null
}

export const config: Config = { schedule: '@hourly' }
