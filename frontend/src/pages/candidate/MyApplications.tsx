import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApplicationStatusBadge } from '../../components/ui/Badge'
import { LinkButton } from '../../components/ui/Button'
import { EmptyState, ErrorBanner, Skeleton } from '../../components/ui/Feedback'
import { Pagination } from '../../components/ui/Pagination'
import { Card, PageHeader } from '../../components/ui/Surface'
import { useMyApplications } from '../../hooks/useApplications'
import { formatDate, initials, relativeTime } from '../../lib/format'
import type { ApplicationStatus } from '../../types'

/** applied → shortlisted → rejected as a track, so where a decision landed is visible
 *  at a glance instead of encoded in a single badge. */
const STAGES: { key: ApplicationStatus; label: string }[] = [
  { key: 'applied', label: 'Applied' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'rejected', label: 'Closed' },
]

function StatusTrack({ status }: { status: ApplicationStatus }) {
  const reached =
    status === 'applied' ? 1 : status === 'shortlisted' ? 2 : 3

  return (
    <ol className="flex items-center gap-1.5" aria-label={`Status: ${status}`}>
      {STAGES.map((stage, index) => {
        const done = index < reached
        const isRejection = stage.key === 'rejected' && status === 'rejected'
        const isCurrent = index === reached - 1
        return (
          <li key={stage.key} className="flex flex-1 items-center gap-1.5">
            <span
              aria-hidden
              className={`h-1 flex-1 rounded-full ${
                done ? (isRejection ? 'bg-critical' : 'bg-good') : 'bg-line'
              }`}
            />
            <span
              className={`font-mono text-[10px] uppercase tracking-wide ${
                isCurrent ? (isRejection ? 'text-critical' : 'text-good') : done ? 'text-ink-3' : 'text-ink-3/60'
              }`}
            >
              {stage.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function MyApplicationsPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, error, refetch } = useMyApplications(page)

  return (
    <div>
      <PageHeader
        eyebrow="Candidate"
        title="Your applications"
        description="Every role you've applied to, and where each one stands."
      />

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      )}

      {isError && (
        <ErrorBanner
          message={error instanceof Error ? error.message : 'Could not load your applications.'}
          onRetry={() => refetch()}
        />
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          title="No applications yet"
          description="Browse the open roles, or let the matcher rank them against what you're after."
          action={
            <div className="flex gap-2">
              <LinkButton to="/jobs" variant="secondary">
                Browse roles
              </LinkButton>
              <LinkButton to="/match">Try AI match</LinkButton>
            </div>
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {data.items.map((application, index) => (
              <li
                key={application.id}
                className="animate-rise"
                style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}
              >
                <Card className="p-5">
                  <div className="flex items-start gap-3.5">
                    <span
                      aria-hidden
                      className="grid h-9 w-9 shrink-0 place-items-center rounded border border-line bg-sunken font-mono text-[11px] font-medium text-ink-2"
                    >
                      {initials(application.job?.company_name ?? '?')}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-[15px] font-semibold text-ink">
                            {application.job ? (
                              <Link to={`/jobs/${application.job.id}`} className="hover:text-accent">
                                {application.job.title}
                              </Link>
                            ) : (
                              'Role removed'
                            )}
                          </h3>
                          <p className="mt-0.5 truncate text-[13px] text-ink-2">
                            {application.job?.company_name} · {application.job?.location}
                          </p>
                        </div>
                        <ApplicationStatusBadge status={application.status} />
                      </div>

                      <div className="mt-4">
                        <StatusTrack status={application.status} />
                      </div>

                      {application.cover_note && (
                        <p className="mt-3.5 line-clamp-2 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink-3">
                          {application.cover_note}
                        </p>
                      )}

                      <p className="mt-3 font-mono text-[11px] text-ink-3">
                        Applied {formatDate(application.created_at)}
                        {application.updated_at !== application.created_at && (
                          <> · updated {relativeTime(application.updated_at)}</>
                        )}
                      </p>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  )
}
