// Voert supabase/schema.sql uit tijdens de Netlify-build, zodat de database altijd bij de code past.
// Het bestand is veilig om steeds opnieuw uit te voeren: bestaande gegevens blijven staan.
// Zonder SUPABASE_DB_URL wordt deze stap overgeslagen (bijv. bij lokaal bouwen).
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.log('[database] SUPABASE_DB_URL is niet ingesteld; database-update overgeslagen.')
  process.exit(0)
}

const sql = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query(sql)
  const { rows } = await client.query("select value from public.app_meta where key = 'schema_version'")
  console.log(`[database] Bijgewerkt naar versie ${rows[0]?.value}.`)
} catch (error) {
  // De build stopt, zodat er geen nieuwe versie online komt die niet bij de database past
  console.error(`[database] Bijwerken mislukt: ${error.message}`)
  console.error('[database] Controleer SUPABASE_DB_URL in Netlify (zie README, "Automatische database-updates").')
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
