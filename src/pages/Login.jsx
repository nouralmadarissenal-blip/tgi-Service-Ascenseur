import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Footer from '../components/Footer'

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
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-slate-50 px-4 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(30,58,138,0.10),_transparent_45%)]"
      />
      <div className="relative flex flex-1 items-center justify-center py-10">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-200 lg:min-h-[620px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-800 p-12 text-white lg:flex">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_80%_15%,_rgba(96,165,250,0.35),_transparent_35%),linear-gradient(145deg,_transparent_35%,_rgba(15,23,42,0.5))]"
          />
          <div className="relative">
            <img
              alt="TGI Ascenseurs"
              className="h-16 w-16 rounded-xl object-cover shadow-xl shadow-slate-950/30"
              src="/logo.jpeg"
            />
          </div>

          <div className="relative max-w-md">
            <div className="mb-6 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-blue-100">
              Votre activité, en mouvement
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Pilotez vos opérations en toute confiance.
            </h1>
            <p className="mt-5 text-base leading-7 text-blue-100/80">
              Une plateforme centralisée pour vos équipes, vos clients et la
              performance de votre activité.
            </p>
          </div>

          <p className="relative text-xs text-blue-200/70">
            © {new Date().getFullYear()} TGI Ascenseurs. Tous droits réservés.
          </p>
          <div
            aria-hidden="true"
            className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full border border-white/10"
          />
        </section>

        <section className="flex items-center justify-center px-6 py-12 sm:px-12 lg:px-14">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex justify-center">
              <img
                alt="TGI Ascenseurs"
                className="h-24 w-auto rounded-2xl object-contain drop-shadow-lg"
                src="/logo.jpeg"
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-brand-700">Espace sécurisé</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                Bon retour
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Connectez-vous pour accéder à votre espace de travail.
              </p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
                  Adresse e-mail
                </label>
                <div className="relative">
                  <Mail
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    autoComplete="email"
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                    id="email"
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nom@entreprise.com"
                    required
                    type="email"
                    value={email}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                  Mot de passe
                </label>
                <div className="relative">
                  <LockKeyhole
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                    id="password"
                    name="password"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                  />
                  <button
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    onClick={() => setShowPassword((visible) => !visible)}
                    type="button"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {visibleError && (
                <p
                  aria-live="polite"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                  {visibleError}
                </p>
              )}

              <button
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-800 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-800/20 transition hover:bg-brand-900 focus:outline-none focus:ring-4 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={submitting}
                type="submit"
              >
                {submitting ? 'Connexion en cours…' : 'Se connecter'}
                {!submitting && <ArrowRight aria-hidden="true" size={17} />}
              </button>
            </form>

            <p className="mt-8 text-center text-xs leading-5 text-slate-400">
              L’accès est réservé aux comptes autorisés par votre administrateur.
            </p>
          </div>
        </section>
        </div>
      </div>
      <Footer className="relative z-10 -mx-4 sm:-mx-6" />
    </main>
  )
}
