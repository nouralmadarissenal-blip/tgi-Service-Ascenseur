import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getProfileName } from '../utils/getAvatar'
import Footer from './Footer'
import Header from './Header'
import Sidebar from './Sidebar'

export default function Layout() {
  const { user, role, logout } = useAuth()
  const location = useLocation()
  const displayName = user?.name || getProfileName(user?.email) || user?.email || 'Utilisateur'
  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  const handleLogout = async () => {
    try {
      setLogoutError('')
      await logout()
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'La déconnexion a échoué.')
    }
  }

  const sidebarProps = {
    displayName,
    logoutError,
    onLogout: () => void handleLogout(),
    role,
    user,
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64.5 lg:block">
        <Sidebar {...sidebarProps} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 animate-slide-down lg:hidden">
          <button
            aria-label="Fermer le menu"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <aside className="relative h-full w-[min(84vw,290px)] animate-slide-up shadow-2xl">
            <Sidebar {...sidebarProps} isMobile onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64.5">
        <Header
          displayName={displayName}
          onMenuOpen={() => setMobileOpen(true)}
          role={role}
          user={user}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-w-0 flex-1 animate-slide-up" key={location.pathname}>
            <Outlet />
          </div>
        </div>
        <Footer className="sm:px-7" />
      </div>
    </div>
  )
}
