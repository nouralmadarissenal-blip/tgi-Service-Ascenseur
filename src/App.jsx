import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Footer from './components/Footer'
import Login from './pages/Login'

const Layout = lazy(() => import('./components/Layout'))
const Clients = lazy(() => import('./pages/Clients'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Settings = lazy(() => import('./pages/Settings'))
const Technicians = lazy(() => import('./pages/Technicians'))
const Interventions = lazy(() => import('./pages/Interventions'))
const Contracts = lazy(() => import('./pages/Contracts'))
const Stock = lazy(() => import('./pages/Stock'))
const Sales = lazy(() => import('./pages/Sales'))
const Recovery = lazy(() => import('./pages/Recovery'))

const authenticatedRoles = ['Directeur', 'Commercial']

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-800" />
        Chargement de votre espace…
      </div>
    </main>
  )
}

function AccessDenied() {
  const { authError, role, logout } = useAuth()
  const [logoutError, setLogoutError] = useState('')

  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'La déconnexion a échoué.')
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-50 px-4">
      <div className="flex flex-1 items-center justify-center py-10">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl shadow-slate-900/5 ring-1 ring-slate-200">
          <h1 className="text-2xl font-semibold text-slate-900">Accès non autorisé</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {role
              ? 'Votre rôle ne permet pas d’accéder à cette page.'
              : 'Aucun rôle autorisé n’est associé à ce compte.'}
          </p>
          {authError && <p className="mt-3 text-sm text-red-700" role="alert">{authError}</p>}
          {logoutError && <p className="mt-3 text-sm text-red-700" role="alert">{logoutError}</p>}
          <button
            className="mt-6 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900"
            onClick={() => void handleLogout()}
            type="button"
          >
            Se déconnecter
          </button>
        </section>
      </div>
      <Footer className="-mx-4" />
    </main>
  )
}

function ProtectedRoute({ allowedRoles = authenticatedRoles, children }) {
  const { user, role, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate replace state={{ from: location }} to="/login" />
  if (!role || (role !== 'SuperAdmin' && !allowedRoles.includes(role))) {
    return <AccessDenied />
  }
  return children
}

function ModulePlaceholder({ title, description }) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
        Espace de travail
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm leading-6 text-slate-600">{description}</p>
        <p className="mt-3 text-xs text-slate-400">Ce module sera disponible dans une prochaine étape.</p>
      </section>
    </main>
  )
}

function AppRoutes() {
  const { user, role, loading } = useAuth()

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route
          element={
            loading ? (
              <LoadingScreen />
            ) : user ? (
              role ? <Navigate replace to="/dashboard" /> : <AccessDenied />
            ) : (
              <Login />
            )
          }
          path="/login"
        />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route element={<Dashboard />} path="/dashboard" />
          <Route
            element={
              <ProtectedRoute allowedRoles={['Commercial']}>
                <Clients />
              </ProtectedRoute>
            }
            path="/clients"
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={['Directeur']}>
                <Technicians />
              </ProtectedRoute>
            }
            path="/technicians"
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={['Directeur']}>
                <Interventions />
              </ProtectedRoute>
            }
            path="/interventions"
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={['Directeur']}>
                <Stock />
              </ProtectedRoute>
            }
            path="/stock"
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={['Directeur', 'Commercial']}>
                <Sales />
              </ProtectedRoute>
            }
            path="/sales"
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={['Directeur']}>
                <Navigate replace to="/sales" />
              </ProtectedRoute>
            }
            path="/purchase-orders"
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={['Directeur']}>
                <Navigate replace to="/sales" />
              </ProtectedRoute>
            }
            path="/delivery-notes"
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={['Directeur', 'Commercial']}>
                <Navigate replace to="/sales" />
              </ProtectedRoute>
            }
            path="/invoices"
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={['Directeur', 'Commercial']}>
                <Contracts />
              </ProtectedRoute>
            }
            path="/contracts"
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={['Directeur', 'Commercial']}>
                <Recovery />
              </ProtectedRoute>
            }
            path="/collections"
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={[]}>
                <Settings />
              </ProtectedRoute>
            }
            path="/settings"
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={['Directeur']}>
                <ModulePlaceholder description="Suivi financier de l’activité et des indicateurs de gestion." title="Finance" />
              </ProtectedRoute>
            }
            path="/finance"
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={['Directeur']}>
                <ModulePlaceholder description="Demandes en attente de validation." title="Validations" />
              </ProtectedRoute>
            }
            path="/validation"
          />
        </Route>

        <Route element={<Navigate replace to={user ? (role ? '/dashboard' : '/login') : '/login'} />} path="*" />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
