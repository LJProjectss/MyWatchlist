import type { Config } from '@netlify/functions'
import { connect, json, send } from '../lib/push.mts'

// Testmelding naar het apparaat dat erom vraagt. Het adres van een aanmelding is geheim
// en alleen bekend bij dat apparaat, dus zonder geldige aanmelding gebeurt er niets.
export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Alleen POST.' }, 405)
  const { endpoint } = await req.json().catch(() => ({}))
  if (typeof endpoint !== 'string') return json({ error: 'Geen aanmelding meegestuurd.' }, 400)
  let db
  try {
    db = await connect()
    const { rows } = await db.query('select id, endpoint, p256dh, auth from public.push_subscriptions where endpoint = $1', [endpoint])
    if (!rows[0]) return json({ error: 'Dit apparaat is niet aangemeld.' }, 404)
    const ok = await send(db, rows[0], {
      title: 'MyWatchlist',
      body: 'Meldingen werken! Je hoort het hier als er een nieuwe aflevering uit is.',
      url: '/',
    })
    return ok ? json({ ok }) : json({ error: 'Versturen mislukt.' }, 502)
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  } finally {
    await db?.end().catch(() => {})
  }
}

export const config: Config = { path: '/api/push/test' }
