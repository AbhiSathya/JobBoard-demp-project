import type { ReactNode } from 'react'

type Tone = 'green' | 'slate' | 'blue' | 'amber' | 'red'

const tones: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function JobStatusBadge({ status }: { status: 'open' | 'closed' }) {
  return <Badge tone={status === 'open' ? 'green' : 'slate'}>{status === 'open' ? 'Open' : 'Closed'}</Badge>
}

export function ApplicationStatusBadge({ status }: { status: 'applied' | 'shortlisted' | 'rejected' }) {
  const tone = status === 'shortlisted' ? 'green' : status === 'rejected' ? 'red' : 'blue'
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return <Badge tone={tone}>{label}</Badge>
}

export function MatchBandBadge({ band }: { band: 'strong' | 'good' | 'fair' | null }) {
  if (!band) return <Badge tone="slate">Weak match</Badge>
  const tone = band === 'strong' ? 'green' : band === 'good' ? 'blue' : 'amber'
  const label = band.charAt(0).toUpperCase() + band.slice(1)
  return <Badge tone={tone}>{label} match</Badge>
}
