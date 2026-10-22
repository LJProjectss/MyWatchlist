import type { Config } from '@netlify/functions'

// Alleen deze TMDB-endpoints mogen via deze proxy worden aangeroepen.
const ALLOWED_PATHS = [/^search\/(multi|movie|tv)$/, /^(movie|tv)\/\d+$/, /^tv\/\d+\/season\/\d+$/]

export default async (req: Request) => {
  const token = process.env.TMDB_API_TOKEN
  if (!token) return json({ error: 'TMDB_API_TOKEN is niet ingesteld in Netlify.' }, 500)

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api\/tmdb\//, '')
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) return json({ error: 'Onbekend endpoint.' }, 400)

  const target = new URL(`https://api.themoviedb.org/3/${path}`)
  url.searchParams.forEach((value, key) => target.searchParams.set(key, value))
  if (!target.searchParams.has('language')) target.searchParams.set('language', 'nl-NL')

  const res = await fetch(target, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  })
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export const config: Config = { path: '/api/tmdb/*' }
