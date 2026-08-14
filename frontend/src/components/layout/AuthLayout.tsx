import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Split layout: the left panel states what the product does, the right holds the
 * form. On narrow screens the statement collapses to a single line above the form
 * rather than stacking a hero nobody scrolled for.
 */
export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="min-h-screen bg-sunken lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <Link to="/login" className="flex items-center gap-2.5">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded bg-accent">
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
              <path d="M2 4.2h8M2 7.8h5" stroke="var(--on-accent)" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-base font-semibold tracking-[-0.01em] text-ink">Job Board</span>
        </Link>

        <div className="max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            Matching, explained
          </p>
          <h2 className="mt-4 text-[2rem] font-semibold leading-[1.15] tracking-[-0.02em] text-ink text-balance">
            Describe the job you want in your own words. Get ranked roles with the reasoning shown.
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
            Every score breaks down into skills, role, domain, experience, location and contract
            type — and every explanation is checked against that breakdown before you see it.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-line pt-6">
            {[
              ['40', 'Skills weight'],
              ['6', 'Scored factors'],
              ['0', 'Invented facts'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="font-mono text-2xl font-medium tabular-nums text-ink">{value}</dt>
                <dd className="mt-1 text-xs leading-snug text-ink-3">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs text-ink-3">Ranking runs on deterministic rules. The model reads and writes.</p>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">{eyebrow}</p>
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-ink text-balance">{title}</h1>
          {description && <p className="mt-2 text-sm leading-relaxed text-ink-2">{description}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 border-t border-line pt-5 text-sm text-ink-2">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
