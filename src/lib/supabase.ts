import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

// Zonder configuratie toont de app een uitlegscherm in plaats van te crashen.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing')

// Supabase geeft maximaal 1000 rijen per keer terug, dus we halen alles in stukken op.
// Gesorteerd op id, zodat de stukken elkaar niet overlappen.
export async function selectAll<T>(
  table: string,
  columns = '*',
  filter?: (query: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    let query = supabase.from(table).select(columns)
    if (filter) query = filter(query)
    const { data, error } = await query.order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data as T[]))
    if (data.length < 1000) return rows
  }
}
