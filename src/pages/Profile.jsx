import { Mail, ShieldCheck, UserRound } from 'lucide-react'
import UserAvatar from '../components/common/UserAvatar'
import { useAuth } from '../context/AuthContext'
import { getProfileName } from '../utils/getAvatar'

const roleLabels = {
  SuperAdmin: 'Super administrateur',
  Directeur: 'Directeur',
  Commercial: 'Commercial',
}

export default function Profile() {
  const { user, role } = useAuth()
  const name = user?.name || getProfileName(user?.email) || 'Utilisateur'

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
          Espace personnel
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Mon profil</h1>
        <p className="mt-2 text-sm text-slate-500">
          Vos informations de compte et votre rôle dans TGI Manager Pro.
        </p>
      </div>

      <section className="mt-8 overflow-hidden rounded-3xl border border-white bg-white/90 shadow-xl shadow-slate-900/[0.05] ring-1 ring-slate-200/70 backdrop-blur-xl">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 px-6 pb-8 pt-7 sm:px-9">
          <div aria-hidden="true" className="absolute -right-10 -top-20 h-56 w-56 rounded-full bg-cyan-300/15 blur-3xl" />
          <p className="relative text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
            Profil professionnel
          </p>
          <div className="relative mt-5 flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <UserAvatar
              className="border-white/80 ring-white/40"
              email={user?.email}
              name={name}
              role={role}
              size="lg"
            />
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight text-white">{name}</h2>
              <p className="mt-1 text-sm text-blue-100/80">{roleLabels[role] || role || 'Rôle non défini'}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-8">
          <article className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <UserRound aria-hidden="true" size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Nom complet</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{name}</p>
            </div>
          </article>
          <article className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Mail aria-hidden="true" size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Adresse e-mail</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{user?.email || '—'}</p>
            </div>
          </article>
          <article className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 sm:col-span-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <ShieldCheck aria-hidden="true" size={18} />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-500">Accès et rôle</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{roleLabels[role] || role || 'Rôle non défini'}</p>
              <p className="mt-1 text-xs text-slate-500">Votre rôle détermine les modules accessibles dans l’application.</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}
