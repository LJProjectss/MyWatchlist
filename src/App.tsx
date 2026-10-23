import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import { isSupabaseConfigured } from './lib/supabase'
import Detail from './pages/Detail'
import Login from './pages/Login'
import Recommendations from './pages/Recommendations'
import Search from './pages/Search'
import Settings from './pages/Settings'
import SharedList from './pages/SharedList'
import Calendar from './pages/Calendar'
import PersonPage from './pages/PersonPage'
import NewPassword from './pages/NewPassword'
import SetupRequired from './pages/SetupRequired'
import Stats from './pages/Stats'
import Watchlist from './pages/Watchlist'

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />
  // Deellinks zijn openbaar en werken zonder in te loggen
  if (location.pathname.startsWith('/delen/')) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/delen/:token" element={<SharedList />} />
        </Routes>
      </BrowserRouter>
    )
  }
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}

function AppRoutes() {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Watchlist />} />
        <Route path="kalender" element={<Calendar />} />
        <Route path="zoeken" element={<Search />} />
        <Route path="titel/:id" element={<Detail />} />
        <Route path="persoon/:source/:id" element={<PersonPage />} />
        <Route path="aanbevolen" element={<Recommendations />} />
        <Route path="statistieken" element={<Stats />} />
        <Route path="instellingen" element={<Settings />} />
        <Route path="nieuw-wachtwoord" element={<NewPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
