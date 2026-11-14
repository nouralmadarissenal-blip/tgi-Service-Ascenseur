import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { authError, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const visibleError = error || authError

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)

    try {
      await login(email, password)
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true })
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'La connexion a échoué. Veuillez réessayer.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_12%,_rgba(70,130,169,0.42),_transparent_44%),radial-gradient(ellipse_at_90%_88%,_rgba(30,64,92,0.7),_transparent_42%),linear-gradient(135deg,_#0f172a,_#172b3b_52%,_#101923)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(226,232,240,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(226,232,240,.12) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse at center, black, transparent 78%)',
        }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-steel-500/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 -right-20 h-96 w-96 rounded-full bg-cyan-800/20 blur-3xl" />

      <div className="relative flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <section
          aria-labelledby="login-title"
          className="w-full max-w-md animate-slide-up rounded-3xl border border-white/15 bg-slate-900/55 p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-9"
        >
          <div className="flex flex-col items-center text-center">
            <div className="rounded-2xl border border-white/60 bg-white p-2 shadow-xl shadow-black/20">
              <img
                alt="Logo de TGI Ascenseurs"
                className="h-20 w-32 object-contain sm:h-24 sm:w-40"
                height="96"
                src="/logo.jpeg"
                width="160"
              />
            </div>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-steel-200/20 bg-steel-200/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-steel-100">
              <ShieldCheck aria-hidden="true" size={14} />
              ESPACE PROFESSIONNEL SÉCURISÉ
            </span>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white" id="login-title">
              TGI Manager Pro
            </h1>
            <p className="mt-2 max-w-xs text-sm leading-6 text-slate-300">
              Connectez-vous pour piloter vos équipes, vos clients et vos opérations.
            </p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Adresse e-mail</span>
              <span className="relative block">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  autoComplete="email"
                  className="w-full rounded-xl border border-white/15 bg-white/[0.06] py-3.5 pl-11 pr-4 text-sm text-white outline-none transition-all placeholder:text-slate-500 hover:border-white/25 focus:border-steel-400 focus:ring-2 focus:ring-steel-400/60"
                  name="email"
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setError('')
                  }}
                  placeholder="nom@entreprise.com"
                  required
                  type="email"
                  value={email}
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Mot de passe</span>
              <span className="relative block">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-white/15 bg-white/[0.06] py-3.5 pl-11 pr-12 text-sm text-white outline-none transition-all placeholder:text-slate-500 hover:border-white/25 focus:border-steel-400 focus:ring-2 focus:ring-steel-400/60"
                  name="password"
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setError('')
                  }}
                  placeholder="Saisissez votre mot de passe"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                />
                <button
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-steel-400"
                  onClick={() => setShowPassword((visible) => !visible)}
                  type="button"
                >
                  {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                </button>
              </span>
            </label>

            {visibleError && (
              <p
                aria-live="polite"
                className="rounded-xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                role="alert"
              >
                {visibleError}
              </p>
            )}

            <button
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-steel-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-steel-950/30 transition-all hover:-translate-y-0.5 hover:bg-steel-500 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-steel-300 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? 'Connexion en cours…' : 'Se connecter'}
              {!submitting && <ArrowRight aria-hidden="true" className="transition-transform group-hover:translate-x-1" size={17} />}
            </button>
          </form>

          <p className="mt-7 border-t border-white/10 pt-5 text-center text-xs leading-5 text-slate-400">
            L’accès est réservé aux comptes autorisés par votre administrateur.
          </p>
        </section>
      </div>

      <footer className="relative z-10 border-t border-white/10 bg-slate-950/25 px-4 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-2 sm:justify-between">
          <p className="text-center text-[11px] font-medium text-slate-400 sm:text-left">
            © 2026 TGI Ascenseurs - Développé par Youness Digital
          </p>
          <img
            alt="TGI Ascenseurs"
            className="h-6 w-auto object-contain opacity-70"
            height="24"
            src="/logo.jpeg"
            width="48"
          />
        </div>
      </footer>
    </main>
  )
}
