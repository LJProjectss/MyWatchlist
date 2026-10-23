import { supabase } from './supabase'

// Ophogen samen met de versie onderaan supabase/schema.sql
export const SCHEMA_VERSION = 7

let check: Promise<boolean> | null = null

// Eén keer per sessie controleren; een mislukte controle proberen we de volgende keer opnieuw
export function databaseIsUpToDate() {
  check ??= (async () => {
    const { data, error } = await supabase.from('app_meta').select('value').eq('key', 'schema_version').maybeSingle()
    if (error || !data) {
      check = null
      return false
    }
    return Number(data.value) >= SCHEMA_VERSION
  })()
  return check
}

// Velden die pas in een nieuwere databaseversie bestaan alleen meesturen als de database al zo ver is,
// anders mislukt het hele opslaan
export async function withNewFields<T extends object>(changes: T, fields: (keyof T)[]): Promise<T> {
  if (await databaseIsUpToDate()) return changes
  const copy = { ...changes }
  for (const field of fields) delete copy[field]
  return copy
}
