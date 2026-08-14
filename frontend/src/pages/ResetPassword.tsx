import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { ErrorBanner } from '../components/ui/Feedback'
import { useToast } from '../components/ui/Toast'
import { ApiError, api } from '../lib/api'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { show } = useToast()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const mismatch = confirm.length > 0 && confirm !== password

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (mismatch) return
    setError(null)
    setBusy(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      show({ intent: 'success', message: 'Password updated', detail: 'Sign in with your new password.' })
      navigate('/login', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reset the password. Request a new link and try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <AuthLayout
        eyebrow="Password reset"
        title="This link is incomplete"
        footer={
          <Link to="/forgot-password" className="font-medium text-accent hover:underline">
            Request a new link
          </Link>
        }
      >
        <ErrorBanner message="The reset link is missing its token. Request a fresh one." />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      eyebrow="Password reset"
      title="Choose a new password"
      description="Setting a new password signs out every other device."
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error && <ErrorBanner message={error} />}
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? "These don't match." : undefined}
        />
        <Button type="submit" loading={busy} disabled={mismatch} className="w-full">
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}
