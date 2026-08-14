import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { LinkButton } from '../components/ui/Button'
import { ErrorBanner } from '../components/ui/Feedback'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { User } from '../types'

type State = 'working' | 'done' | 'failed'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { refreshUser } = useAuth()

  const [state, setState] = useState<State>(token ? 'working' : 'failed')
  const [message, setMessage] = useState('The verification link is missing its token.')
  const [user, setUser] = useState<User | null>(null)
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true // StrictMode mounts twice in dev; verify once.
    ;(async () => {
      try {
        const verified = await api.post<User>('/auth/verify-email', { token })
        setUser(verified)
        setState('done')
        await refreshUser()
      } catch (err) {
        setMessage(
          err instanceof ApiError ? err.message : 'Could not verify this link. Request a new one.',
        )
        setState('failed')
      }
    })()
  }, [token, refreshUser])

  return (
    <AuthLayout
      eyebrow="Email verification"
      title={
        state === 'working' ? 'Verifying…' : state === 'done' ? 'Email verified' : 'Verification failed'
      }
      description={
        state === 'done'
          ? user?.role === 'admin'
            ? 'Your company account is ready. Post your first role whenever you like.'
            : 'You can apply to roles now. Filling in your profile makes the matching sharper.'
          : undefined
      }
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      {state === 'working' && (
        <div className="flex items-center gap-2.5 text-sm text-ink-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
          Confirming your address…
        </div>
      )}

      {state === 'done' && (
        <LinkButton to={user?.role === 'admin' ? '/admin/jobs/new' : '/profile'} className="w-full">
          {user?.role === 'admin' ? 'Post a job' : 'Complete your profile'}
        </LinkButton>
      )}

      {state === 'failed' && (
        <div className="flex flex-col gap-4">
          <ErrorBanner message={message} />
          <p className="text-sm text-ink-2">
            Verification links expire after 24 hours. Sign in and use the banner at the top of the page
            to send yourself a fresh one.
          </p>
        </div>
      )}
    </AuthLayout>
  )
}
