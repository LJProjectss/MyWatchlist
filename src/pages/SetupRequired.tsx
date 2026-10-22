export default function SetupRequired() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md space-y-3 rounded-xl border border-line bg-panel p-6">
        <h1 className="text-xl font-semibold">Configuratie ontbreekt</h1>
        <p className="text-sm text-muted">
          Stel de omgevingsvariabelen <code className="text-fg">VITE_SUPABASE_URL</code> en{' '}
          <code className="text-fg">VITE_SUPABASE_ANON_KEY</code> in (lokaal in <code>.env</code>, online in
          Netlify onder Site configuration → Environment variables) en bouw de site opnieuw.
        </p>
      </div>
    </div>
  )
}
