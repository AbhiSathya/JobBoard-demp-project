import type { ReactNode } from 'react'
import type { ApplicationStatus, JobStatus } from '../../types'

export function Chip({
  children,
  tone = 'neutral',
  onRemove,
  removeLabel,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'good' | 'muted'
  onRemove?: () => void
  removeLabel?: string
}) {
  const tones = {
    neutral: 'border-line bg-sunken text-ink-2',
    accent: 'border-accent/25 bg-accent-soft text-accent',
    good: 'border-good/25 bg-good-soft text-good',
    muted: 'border-line bg-transparent text-ink-3',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${tones[tone]}`}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? 'Remove'}
          className="-mr-0.5 ml-0.5 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
            <path d="M1.5 1.5l6 6M7.5 1.5l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  )
}

/** A dot plus a word. Never colour alone. */
function StatusPill({ tone, label }: { tone: 'good' | 'warn' | 'critical' | 'neutral'; label: string }) {
  const tones = {
    good: 'border-good/25 bg-good-soft text-good',
    warn: 'border-warn/25 bg-warn-soft text-warn',
    critical: 'border-critical/25 bg-critical-soft text-critical',
    neutral: 'border-line bg-sunken text-ink-2',
  }
  const dots = { good: 'bg-good', warn: 'bg-warn', critical: 'bg-critical', neutral: 'bg-ink-3' }
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${tones[tone]}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} />
      {label}
    </span>
  )
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return status === 'open' ? (
    <StatusPill tone="good" label="Open" />
  ) : (
    <StatusPill tone="neutral" label="Closed" />
  )
}

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const map = {
    applied: { tone: 'neutral', label: 'Applied' },
    shortlisted: { tone: 'good', label: 'Shortlisted' },
    rejected: { tone: 'critical', label: 'Rejected' },
  } as const
  return <StatusPill {...map[status]} />
}

export function MatchBandBadge({ band }: { band: string | null }) {
  const map: Record<string, { tone: 'good' | 'warn' | 'neutral'; label: string }> = {
    strong: { tone: 'good', label: 'Strong match' },
    good: { tone: 'good', label: 'Good match' },
    fair: { tone: 'warn', label: 'Fair match' },
  }
  const entry = band ? map[band] : undefined
  return <StatusPill tone={entry?.tone ?? 'neutral'} label={entry?.label ?? 'Weak match'} />
}
