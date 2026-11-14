import {
  Boxes,
  ClipboardList,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  UserRound,
  WalletCards,
  Wrench,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import UserAvatar from './common/UserAvatar'

const navigation = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Mon profil', to: '/profile', icon: UserRound },
  { label: 'Clients', to: '/clients', icon: Users, allowedRoles: ['Commercial'] },
  { label: 'Techniciens', to: '/technicians', icon: Wrench, allowedRoles: ['Directeur'] },
  { label: 'Interventions', to: '/interventions', icon: ClipboardList, allowedRoles: ['Directeur'] },
  { label: 'Stock', to: '/stock', icon: Boxes, allowedRoles: ['Directeur'] },
  { label: 'Ventes', to: '/sales', icon: FileText, allowedRoles: ['Directeur', 'Commercial'] },
  { label: 'Contrats', to: '/contracts', icon: FileCheck2, allowedRoles: ['Directeur', 'Commercial'] },
  { label: 'Recouvrement', to: '/collections', icon: WalletCards, allowedRoles: ['Directeur', 'Commercial'] },
]

export default function Sidebar({
  displayName,
  isMobile = false,
  logoutError,
  onClose,
  onLogout,
  role,
  user,
}) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-900 to-slate-800 text-slate-300 shadow-xl shadow-slate-950/20">
      <div className="flex h-20 shrink-0 items-center justify-center border-b border-slate-700/50 px-5">
        <img
          alt="TGI Ascenseurs"
          className="h-12 w-auto max-w-[200px] object-contain transition-transform duration-200 hover:scale-[1.03]"
          src="/logo.jpeg"
        />
        {isMobile && (
          <button
            aria-label="Fermer le menu"
            className="absolute right-3 rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        )}
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
                `flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px] font-medium transition ${
                  isActive
                    ? 'border-blue-600/50 bg-blue-700 text-white shadow-md shadow-blue-950/30'
                    : 'border-transparent text-slate-400 hover:border-slate-700/70 hover:bg-white/5 hover:text-white'
                }`
              }
              end={to === '/dashboard'}
              key={to}
              onClick={onClose}
              to={to}
            >
              <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
      </nav>

      <div className="shrink-0 border-t border-slate-700/50 p-4">
        <div className="mb-3 flex min-w-0 items-center gap-3 px-1">
          <UserAvatar className="border-white/15" email={user?.email} name={displayName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{displayName}</p>
            <p className="mt-1 truncate text-[11px] text-slate-400">{role} · {user?.email}</p>
          </div>
        </div>
        {logoutError && <p className="mb-2 text-xs text-red-300" role="alert">{logoutError}</p>}
        {['SuperAdmin', 'Directeur', 'Commercial'].includes(role) && (
          <NavLink
            className={({ isActive }) =>
              `mb-1 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px] font-medium transition ${
                isActive
                  ? 'border-blue-600/50 bg-blue-700 text-white shadow-md shadow-blue-950/30'
                  : 'border-transparent text-slate-400 hover:border-slate-700/70 hover:bg-white/5 hover:text-white'
              }`
            }
            onClick={onClose}
            to="/settings"
          >
            <Settings aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>Paramètres</span>
          </NavLink>
        )}
        <button
          className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-xs font-medium text-slate-400 transition hover:border-slate-700/70 hover:bg-white/5 hover:text-white"
          onClick={onLogout}
          type="button"
        >
          <LogOut aria-hidden="true" size={16} />
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
