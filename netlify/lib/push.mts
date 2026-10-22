// Gedeelde code voor pushmeldingen. Draait alleen op de server (Netlify Functions) en praat
// rechtstreeks met de database via SUPABASE_DB_URL, zodat de geheime sleutel nooit in de app komt.
import pg from 'pg'
import webpush from 'web-push'

export async function connect() {
  const url = process.env.SUPABASE_DB_URL
  if (!url) throw new Error('SUPABASE_DB_URL is niet ingesteld voor Functions in Netlify.')
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  return client
}

// De sleutels worden de eerste keer vanzelf gemaakt en daarna in de database bewaard
export async function vapidKeys(db: pg.Client) {
  const existing = await db.query('select public_key, private_key from private.push_keys where id = 1')
  if (existing.rows[0]) return existing.rows[0] as { public_key: string; private_key: string }
  const keys = webpush.generateVAPIDKeys()
  await db.query(
    'insert into private.push_keys (id, public_key, private_key) values (1, $1, $2) on conflict (id) do nothing',
    [keys.publicKey, keys.privateKey],
  )
  return (await db.query('select public_key, private_key from private.push_keys where id = 1')).rows[0]
}

export interface Subscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface Message {
  title: string
  body: string
  url: string
}

// Stuurt een melding naar één apparaat; verlopen abonnementen worden opgeruimd
export async function send(db: pg.Client, sub: Subscription, message: Message) {
  const { public_key, private_key } = await vapidKeys(db)
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(message),
      { vapidDetails: { subject: process.env.URL ?? 'https://mywatchlist.netlify.app', publicKey: public_key, privateKey: private_key }, TTL: 24 * 60 * 60 },
    )
    return true
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) await db.query('delete from public.push_subscriptions where id = $1', [sub.id])
    else console.error(`[push] Versturen mislukt (${status ?? 'onbekend'}): ${(error as Error).message}`)
    return false
  }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
