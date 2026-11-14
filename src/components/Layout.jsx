import { useState } from 'react'
import {
  Boxes,
  Building2,
  ClipboardList,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  WalletCards,
  Wrench,
  X,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navigation = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Clients', to: '/clients', icon: Users, allowedRoles: ['Commercial'] },
  { label: 'Techniciens', to: '/technicians', icon: Wrench, allowedRoles: ['Directeur'] },
  { label: 'Interventions', to: '/interventions', icon: ClipboardList, allowedRoles: ['Directeur'] },
  { label: 'Stock', to: '/stock', icon: Boxes, allowedRoles: ['Directeur'] },
  { label: 'Ventes', to: '/sales', icon: FileText, allowedRoles: ['Directeur', 'Commercial'] },
  { label: 'Contrats', to: '/contracts', icon: FileCheck2, allowedRoles: ['Directeur', 'Commercial'] },
  { label: 'Recouvrement', to: '/collections', icon: WalletCards, allowedRoles: ['Directeur', 'Commercial'] },
  { label: 'Paramètres', to: '/settings', icon: Settings, adminOnly: true },
]

export default function Layout() {
  const { user, role, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'La déconnexion a échoué.')
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <div className="flex h-19 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-950/40">
          <Building2 aria-hidden="true" size={21} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-wide text-white">TGI Manager</p>
          <p className="text-[11px] text-slate-400">Ascenseurs · Pro</p>
        </div>
        <button
          aria-label="Fermer le menu"
          className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setMobileOpen(false)}
          type="button"
        >
          <X size={18} />
        </button>
      </div>

      <nav aria-label="Navigation principale" className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Espace de travail
        </p>
        {navigation
          .filter((item) =>
            item.adminOnly
              ? role === 'SuperAdmin'
              : role === 'SuperAdmin' || !item.allowedRoles || item.allowedRoles.includes(role),
          )
          .map(({ label, to, icon: Icon }) => (
            <NavLink
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-950/30'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`
              }
              end={to === '/dashboard'}
              key={to}
              onClick={() => setMobileOpen(false)}
              to={to}
            >
              <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="mb-3 min-w-0 px-1">
          <p className="truncate text-xs font-medium text-white">{user?.name || user?.email}</p>
          <p className="mt-1 truncate text-[11px] text-slate-500">{role} · {user?.email}</p>
        </div>
        {logoutError && <p className="mb-2 text-xs text-red-300" role="alert">{logoutError}</p>}
        <button
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
          onClick={() => void handleLogout()}
          type="button"
        >
          <LogOut aria-hidden="true" size={16} />
          Se déconnecter
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64.5 lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Fermer le menu"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <aside className="relative h-full w-[min(84vw,290px)] shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="min-h-screen lg:pl-64.5">
        <header className="sticky top-0 z-20 flex h-17 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-7 lg:hidden">
          <button
            aria-label="Ouvrir le menu"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-bold text-slate-900">TGI Manager Pro</span>
        </header>
        <Outlet />
      </div>
    </div>
  )
}
