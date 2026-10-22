import { supabase } from './supabase'

// Ophogen samen met de versie onderaan supabase/schema.sql
export const SCHEMA_VERSION = 4

export async function databaseIsUpToDate() {
  const { data, error } = await supabase.from('app_meta').select('value').eq('key', 'schema_version').maybeSingle()
  if (error || !data) return false
  return Number(data.value) >= SCHEMA_VERSION
}
