import { useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'

/**
 * Unverified accounts can browse everything; only applying and posting are gated.
 * This says so plainly instead of letting the user find out by being refused.
 */
export function VerifyBanner() {
  const { user } = useAuth()
  const { show } = useToast()
  const [sending, setSending] = useState(false)

  if (!user || user.is_verified) return null

  const blocked = user.role === 'admin' ? 'post a job' : 'apply to a job'

  async function resend() {
    setSending(true)
    try {
      await api.post('/auth/resend-verification', { email: user!.email })
      show({ intent: 'info', message: 'Verification email sent', detail: `Check ${user!.email}.` })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-warn/25 bg-warn-soft px-4 py-3">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-warn">
        <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 5v4M8 11.4v.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <p className="flex-1 text-sm text-warn">
        Confirm your email address to {blocked}. We sent a link to <strong>{user.email}</strong>.
      </p>
      <Button size="sm" variant="secondary" onClick={resend} loading={sending}>
        Resend
      </Button>
    </div>
  )
}
