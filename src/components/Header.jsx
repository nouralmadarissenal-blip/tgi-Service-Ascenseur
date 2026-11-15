import { Menu } from 'lucide-react'
import { Link } from 'react-router-dom'
import UserAvatar from './common/UserAvatar'

export default function Header({ displayName, onMenuOpen, role, user }) {
  return (
    <header className="sticky top-0 z-20 flex h-20 items-center gap-3 border-b border-slate-700/50 bg-gradient-to-b from-slate-900 to-slate-800 px-4 text-white shadow-lg shadow-slate-950/10 sm:px-7">
      <button
        aria-label="Ouvrir le menu"
        className="rounded-lg border border-slate-700/70 p-2 text-slate-300 transition hover:border-slate-500 hover:bg-white/10 hover:text-white lg:hidden"
        onClick={onMenuOpen}
        type="button"
      >
        <Menu aria-hidden="true" size={20} />
      </button>
      <Link aria-label="TGI Ascenseurs — Accueil" className="flex shrink-0 items-center" to="/dashboard">
        <img
          alt="TGI Ascenseurs"
          className="h-12 w-auto max-w-[min(48vw,220px)] object-contain transition-transform duration-200 hover:scale-[1.03]"
          src="/logo.jpeg"
        />
      </Link>
      <div className="ml-auto flex min-w-0 items-center gap-3">
        <div className="hidden min-w-0 text-right sm:block">
          <p className="max-w-48 truncate text-sm font-semibold text-white">{displayName}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{role}</p>
        </div>
        <UserAvatar
          className="border-slate-300/30 ring-blue-400/40"
          email={user?.email}
          name={displayName}
          role={role}
          size="sm"
        />
      </div>
    </header>
  )
}
