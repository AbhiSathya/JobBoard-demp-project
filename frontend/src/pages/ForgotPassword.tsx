import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { api } from '../lib/api'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
    } finally {
      // The server answers identically whether or not the address exists, and so
      // does this screen — otherwise the form itself leaks who has an account.
      setSent(true)
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Password reset"
      title={sent ? 'Check your inbox' : 'Reset your password'}
      description={
        sent
          ? undefined
          : "Enter the address on your account and we'll send a link to set a new password."
      }
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-md border border-line bg-surface p-5">
          <p className="text-sm leading-relaxed text-ink-2">
            If an account exists for <strong className="text-ink">{email}</strong>, a reset link is on
            its way. It expires in 30 minutes and can only be used once.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-3 text-xs text-ink-3 transition-colors hover:text-accent"
          >
            Use a different address
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
          <Button type="submit" loading={busy} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
