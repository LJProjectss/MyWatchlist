import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import { isSupabaseConfigured } from './lib/supabase'
import Login from './pages/Login'
import Search from './pages/Search'
import SetupRequired from './pages/SetupRequired'
import Watchlist from './pages/Watchlist'

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />
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
        <Route path="zoeken" element={<Search />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
