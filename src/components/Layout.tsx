import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { databaseIsUpToDate } from '../lib/schemaVersion'
import { useScrollRestoration } from '../lib/useScrollRestoration'

const NAV = [
  { to: '/', label: 'Mijn lijst', icon: ListIcon },
  { to: '/zoeken', label: 'Zoeken', icon: SearchIcon },
  { to: '/aanbevolen', label: 'Aanbevolen', icon: SparkIcon },
  { to: '/statistieken', label: 'Statistieken', icon: ChartIcon },
]

export default function Layout() {
  useScrollRestoration()
  const [outdated, setOutdated] = useState(false)
  useEffect(() => {
    databaseIsUpToDate().then((ok) => setOutdated(!ok))
  }, [])

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/favicon.svg" alt="" className="size-7" />
            MyWatchlist
          </span>
          <nav className="hidden gap-1 md:flex">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition ${
                    isActive ? 'bg-panel text-fg' : 'text-muted hover:text-fg'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <NavLink
            to="/instellingen"
            aria-label="Instellingen"
            className={({ isActive }) =>
              `ml-auto flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
                isActive ? 'bg-panel text-fg' : 'text-muted hover:text-fg'
              }`
            }
          >
            <GearIcon />
            <span className="hidden sm:inline">Instellingen</span>
          </NavLink>
        </div>
      </header>

      {outdated && (
        <div className="border-b border-amber-500/30 bg-amber-500/10">
          <p className="mx-auto max-w-6xl px-4 py-2.5 text-sm sm:px-6">
            Je database moet worden bijgewerkt voor de nieuwste versie van de app. Voer{' '}
            <a
              href="https://github.com/LJProjectss/MyWatchlist/blob/main/supabase/schema.sql"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              supabase/schema.sql
            </a>{' '}
            uit in Supabase, of zet automatische updates aan (zie de README).
          </p>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      {/* Onderste navigatiebalk op telefoon */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-xs ${isActive ? 'text-fg' : 'text-muted'}`
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" strokeLinejoin="round" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
        strokeLinejoin="round"
      />
    </svg>
  )
}
