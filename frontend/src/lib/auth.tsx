import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, onSessionExpired, setAccessToken } from './api'
import type { Role, User } from '../types'

interface TokenResponse {
  access_token: string
  user: User
}

interface AuthContextValue {
  user: User | null
  /** True until the initial silent refresh settles — routes must not redirect before then. */
  restoring: boolean
  login: (email: string, password: string) => Promise<User>
  register: (email: string, password: string, role: Role, companyName?: string) => Promise<User>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Only the display identity is cached, never a credential — the access token lives
// in memory and the refresh token in an httpOnly cookie.
const USER_KEY = 'jobboard_user'

function cachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(cachedUser)
  const [restoring, setRestoring] = useState(true)

  function persist(data: TokenResponse) {
    setAccessToken(data.access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    setUser(data.user)
  }

  function clear() {
    setAccessToken(null)
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }

  // On boot there is no access token in memory, so exchange the cookie for one.
  useEffect(() => {
    let cancelled = false
    onSessionExpired(() => clear())
    ;(async () => {
      const ok = await api.refresh()
      if (cancelled) return
      if (ok) {
        try {
          const me = await api.get<User>('/auth/me')
          localStorage.setItem(USER_KEY, JSON.stringify(me))
          setUser(me)
        } catch {
          clear()
        }
      } else {
        clear()
      }
      setRestoring(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function login(email: string, password: string) {
    const data = await api.post<TokenResponse>('/auth/login', { email, password })
    persist(data)
    return data.user
  }

  async function register(email: string, password: string, role: Role, companyName?: string) {
    const data = await api.post<TokenResponse>('/auth/register', {
      email,
      password,
      role,
      company_name: companyName,
    })
    persist(data)
    return data.user
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } finally {
      clear()
    }
  }

  async function refreshUser() {
    try {
      const me = await api.get<User>('/auth/me')
      localStorage.setItem(USER_KEY, JSON.stringify(me))
      setUser(me)
    } catch {
      /* leave the current identity in place; the next request will surface it */
    }
  }

  return (
    <AuthContext.Provider value={{ user, restoring, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
