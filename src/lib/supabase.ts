import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

// Zonder configuratie toont de app een uitlegscherm in plaats van te crashen.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing')
