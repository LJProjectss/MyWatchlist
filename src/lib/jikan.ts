import { JIKAN } from './catalog'

// Jikan staat ongeveer 3 verzoeken per seconde toe. Alle verzoeken via deze functie
// gaan na elkaar, met wat ruimte ertussen, en bij "te druk" proberen we het nog eens.
let queue: Promise<unknown> = Promise.resolve()

export function jikan<T>(path: string): Promise<T> {
  const run = queue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 400 : 1500 * attempt))
      const res = await fetch(`${JIKAN}/${path}`)
      if (res.status === 429 && attempt < 3) continue
      if (!res.ok) throw new Error(`Jikan gaf foutcode ${res.status}`)
      return (await res.json()) as T
    }
  })
  queue = run.catch(() => {})
  return run
}
