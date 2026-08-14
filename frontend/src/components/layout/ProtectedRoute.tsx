import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import type { Role } from '../../types'

/**
 * Cosmetic only — the server is the authority on every one of these rules. This
 * exists so a candidate never sees a broken admin page, not as a security control.
 */
export function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { user, restoring } = useAuth()
  const location = useLocation()

  // Redirecting before the silent refresh settles would sign out anyone who
  // reloads the page, since the access token only lives in memory.
  if (restoring) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Restoring session">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/jobs'} replace />

  return <>{children}</>
}
