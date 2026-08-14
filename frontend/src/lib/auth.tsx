import { createContext, useContext, useState, type ReactNode } from 'react'
import { api } from './api'
import type { Role, User } from '../types'

interface TokenResponse {
  access_token: string
  user: User
}

interface AuthContextValue {
  user: User | null
  login: (email: string, password: string) => Promise<User>
  register: (email: string, password: string, role: Role, companyName?: string) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'jobboard_token'
const USER_KEY = 'jobboard_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  })

  function persist(data: TokenResponse) {
    localStorage.setItem(TOKEN_KEY, data.access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    setUser(data.user)
  }

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

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
