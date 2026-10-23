import type { Config } from '@netlify/functions'

// Alleen deze TMDB-endpoints mogen via deze proxy worden aangeroepen.
const ALLOWED_PATHS = [
  /^search\/(multi|movie|tv)$/,
  /^(movie|tv)\/\d+$/,
  /^tv\/\d+\/season\/\d+$/,
  /^(movie|tv)\/\d+\/(watch\/providers|recommendations|videos)$/,
  /^movie\/\d+\/credits$/,
  /^tv\/\d+\/aggregate_credits$/,
  /^person\/\d+(\/combined_credits)?$/,
  /^collection\/\d+$/,
  /^trending\/(all|movie|tv)\/(day|week)$/,
]

export default async (req: Request) => {
  const token = process.env.TMDB_API_TOKEN
  if (!token) return json({ error: 'TMDB_API_TOKEN is niet ingesteld in Netlify.' }, 500)

  if (!(await isLoggedIn(req))) return json({ error: 'Log opnieuw in om te zoeken.' }, 401)

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api\/tmdb\//, '')
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) return json({ error: 'Onbekend endpoint.' }, 400)

  const target = new URL(`https://api.themoviedb.org/3/${path}`)
  url.searchParams.forEach((value, key) => target.searchParams.set(key, value))
  if (!target.searchParams.has('language')) target.searchParams.set('language', 'nl-NL')

  const res = await fetch(target, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=3600' },
  })
}

// Controleert bij Supabase of het meegestuurde inlogtoken geldig is. Goedgekeurde tokens onthouden we
// even, zodat niet elke zoekopdracht een extra aanroep kost.
const verified = new Map<string, number>()

async function isLoggedIn(req: Request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    // Zonder deze gegevens kunnen we niet controleren; dan liever werken dan alles blokkeren
    console.warn('[tmdb] VITE_SUPABASE_URL of VITE_SUPABASE_ANON_KEY niet beschikbaar voor Functions; inlogcontrole overgeslagen.')
    return true
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer /i, '')
  if (!token) return false
  const now = Date.now()
  if ((verified.get(token) ?? 0) > now) return true
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } })
  if (!res.ok) return false
  if (verified.size > 500) verified.clear()
  verified.set(token, now + 10 * 60 * 1000)
  return true
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export const config: Config = { path: '/api/tmdb/*' }
