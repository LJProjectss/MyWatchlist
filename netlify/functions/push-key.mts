import type { Config } from '@netlify/functions'
import { connect, json, vapidKeys } from '../lib/push.mts'

// De openbare sleutel die de browser nodig heeft om zich aan te melden voor meldingen
export default async () => {
  let db
  try {
    db = await connect()
    const { public_key } = await vapidKeys(db)
    return json({ publicKey: public_key })
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  } finally {
    await db?.end().catch(() => {})
  }
}

export const config: Config = { path: '/api/push/key' }
