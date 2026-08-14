import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import type { Role } from '../../types'

export function ProtectedRoute({ role, children }: { role?: Role; children: React.ReactNode }) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/jobs'} replace />
  }
  return <>{children}</>
}
