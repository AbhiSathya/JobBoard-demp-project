import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { ErrorBanner } from '../components/ui/Feedback'
import { useToast } from '../components/ui/Toast'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Role } from '../types'

const ROLES: { value: Role; label: string; blurb: string }[] = [
  { value: 'candidate', label: 'Candidate', blurb: 'Find and apply to roles' },
  { value: 'admin', label: 'Company', blurb: 'Post jobs and review applicants' },
]

/** Length, mixed case, a digit, a symbol — four checks, four segments. */
function strength(password: string): { score: number; label: string } {
  const checks = [password.length >= 12, /[a-z]/.test(password) && /[A-Z]/.test(password), /\d/.test(password), /[^\w\s]/.test(password)]
  const score = password.length >= 8 ? checks.filter(Boolean).length : 0
  return { score, label: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score] }
}

export function RegisterPage() {
  const { register } = useAuth()
  const { show } = useToast()
  const navigate = useNavigate()

  const [role, setRole] = useState<Role>('candidate')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pw = strength(password)
  const tooShort = password.length > 0 && password.length < 8

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const user = await register(email.trim(), password, role, role === 'admin' ? companyName.trim() : undefined)
      show({
        intent: 'success',
        message: 'Account created',
        detail: `Check ${user.email} for a verification link.`,
      })
      navigate(user.role === 'admin' ? '/admin' : '/jobs', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the account. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Create account"
      title="Get started"
      description="Takes a minute. You'll get an email to confirm the address."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error && <ErrorBanner message={error} />}

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink-2">I'm signing up as</legend>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRole(option.value)}
                aria-pressed={role === option.value}
                className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
                  role === option.value
                    ? 'border-accent bg-accent-soft'
                    : 'border-line-strong bg-surface hover:border-line-strong hover:bg-sunken'
                }`}
              >
                <span className={`block text-sm font-medium ${role === option.value ? 'text-accent' : 'text-ink'}`}>
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">{option.blurb}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {role === 'admin' && (
          <Input
            label="Company name"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Health"
            hint="Shown on every job you post."
          />
        )}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />

        <div>
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            error={tooShort ? 'Use at least 8 characters.' : undefined}
          />
          {password.length >= 8 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1" aria-hidden>
                {[1, 2, 3, 4].map((step) => (
                  <span
                    key={step}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      step <= pw.score ? (pw.score >= 3 ? 'bg-good' : 'bg-warn') : 'bg-line'
                    }`}
                  />
                ))}
              </div>
              <span className="font-mono text-[10px] uppercase tracking-wide text-ink-3">{pw.label}</span>
            </div>
          )}
        </div>

        <Button type="submit" loading={busy} className="mt-1 w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
