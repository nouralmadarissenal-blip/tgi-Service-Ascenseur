import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth, db } from '../firebase/config'

const ALLOWED_ROLES = new Set(['Directeur', 'Commercial', 'SuperAdmin'])
const AuthContext = createContext(null)

function getUserFromProfile(firebaseUser, profile, role, active) {
  return {
    uid: firebaseUser.uid,
    name:
      profile?.name ||
      profile?.fullName ||
      profile?.nom ||
      firebaseUser.displayName ||
      '',
    email: profile?.email || firebaseUser.email || '',
    role,
    active,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let mounted = true
    let authChangeId = 0

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        const changeId = ++authChangeId
        if (!firebaseUser) {
          if (!mounted) return
          setUser(null)
          setRole(null)
          setAuthError('')
          setLoading(false)
          return
        }

        setLoading(true)
        try {
          const userDocument = await getDoc(doc(db, 'users', firebaseUser.uid))
          if (!mounted || changeId !== authChangeId) return

          if (!userDocument.exists()) {
            setUser(getUserFromProfile(firebaseUser, null, null, false))
            setRole(null)
            setAuthError('Aucun profil utilisateur n’est associé à ce compte.')
            setLoading(false)
            return
          }

          const profile = userDocument.data()
          const active = profile.active === true
          const profileRole = ALLOWED_ROLES.has(profile.role) ? profile.role : null
          const authorizedRole = active ? profileRole : null

          setUser(getUserFromProfile(firebaseUser, profile, authorizedRole, active))
          setRole(authorizedRole)
          setAuthError(
            !active
              ? 'Ce compte est désactivé. Contactez un administrateur.'
              : !profileRole
                ? 'Aucun rôle valide n’est associé à ce compte.'
                : '',
          )
          setLoading(false)
        } catch (error) {
          if (!mounted || changeId !== authChangeId) return
          setUser(getUserFromProfile(firebaseUser, null, null, false))
          setRole(null)
          setAuthError(
            error instanceof Error
              ? `Impossible de charger votre profil : ${error.message}`
              : 'Impossible de charger votre profil utilisateur.',
          )
          setLoading(false)
        }
      },
      (error) => {
        if (!mounted) return
        authChangeId += 1
        setUser(null)
        setRole(null)
        setAuthError(error.message)
        setLoading(false)
      },
    )

    return () => {
      mounted = false
      authChangeId += 1
      unsubscribe()
    }
  }, [])

  const login = useCallback(async (email, password) => {
    setAuthError('')
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
    return credential.user
  }, [])

  const logout = useCallback(async () => {
    setAuthError('')
    await signOut(auth)
  }, [])

  const value = useMemo(
    () => ({ user, role, loading, authError, login, logout }),
    [user, role, loading, authError, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Keep the auth hook beside its provider so both share the same context.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth doit être utilisé à l’intérieur de AuthProvider.')
  }
  return context
}
