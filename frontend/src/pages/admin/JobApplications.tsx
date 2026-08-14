import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApplicationStatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { EmptyState, ErrorBanner, Skeleton } from '../../components/ui/Feedback'
import { Card, Meta, PageHeader } from '../../components/ui/Surface'
import { useToast } from '../../components/ui/Toast'
import { useJobApplications, useUpdateApplicationStatus } from '../../hooks/useApplications'
import { useJob } from '../../hooks/useJobs'
import { formatDate, initials } from '../../lib/format'
import type { Application, ApplicationStatus, Job } from '../../types'

/** Mirrors the backend's allowed transitions, so a button that would 409 is never
 *  rendered in the first place. */
const NEXT_STATUSES: Record<ApplicationStatus, ApplicationStatus[]> = {
  applied: ['shortlisted', 'rejected'],
  shortlisted: ['rejected'],
  rejected: [],
}

/** Stable empty array — a fresh `[]` per render would retrigger the effects below. */
const NO_ITEMS: Application[] = []

export function AdminJobApplicationsPage() {
  const { jobId } = useParams()
  const id = jobId ? Number(jobId) : undefined
  const [status, setStatus] = useState<ApplicationStatus | ''>('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data: job } = useJob(id)
  const { data, isLoading, isError, refetch } = useJobApplications(id, { status, page: 1 })
  const update = useUpdateApplicationStatus()
  const { show } = useToast()

  const items = data?.items ?? NO_ITEMS
  const selected = items.find((a) => a.id === selectedId) ?? items[0] ?? null

  // Keep a selection valid as the list filters underneath it.
  useEffect(() => {
    if (items.length && !items.some((a) => a.id === selectedId)) setSelectedId(items[0].id)
  }, [items, selectedId])

  // j/k moves between candidates — reviewing a stack of applications is a
  // keyboard job, and reaching for the mouse per candidate is the slow path.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'j' && event.key !== 'k') return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (!items.length) return
      const index = items.findIndex((a) => a.id === selected?.id)
      const next = event.key === 'j' ? Math.min(index + 1, items.length - 1) : Math.max(index - 1, 0)
      setSelectedId(items[next].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, selected])

  function move(application: Application, next: ApplicationStatus) {
    update.mutate(
      { applicationId: application.id, status: next },
      {
        onSuccess: () =>
          show({
            intent: 'success',
            message: `${application.profile_snapshot.name} moved to ${next}`,
          }),
      },
    )
  }

  return (
    <div>
      <Link
        to="/admin/jobs"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-accent"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M9.5 3.5L5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All postings
      </Link>

      <PageHeader
        eyebrow="Employer"
        title={job ? job.title : 'Applications'}
        description={job ? `${job.location} · ${job.required_skills.length} required skills` : undefined}
        action={
          <div className="w-44">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as ApplicationStatus | '')}
              aria-label="Filter by status"
            >
              <option value="">All applicants</option>
              <option value="applied">Applied</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="rejected">Rejected</option>
            </Select>
          </div>
        }
      />

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <Skeleton className="h-96 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      )}

      {isError && <ErrorBanner message="Could not load applications." onRetry={() => refetch()} />}

      {data && items.length === 0 && (
        <EmptyState
          title={status ? `No ${status} applicants` : 'No applications yet'}
          description={
            status
              ? 'Switch the filter back to All applicants to see everyone.'
              : "Candidates appear here the moment they apply. You'll also get an email."
          }
        />
      )}

      {items.length > 0 && selected && (
        <div className="grid items-start gap-4 lg:grid-cols-[20rem_1fr]">
          <nav className="overflow-hidden rounded-lg border border-line bg-surface" aria-label="Applicants">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                {data?.total} applicant{data?.total === 1 ? '' : 's'}
              </span>
              <span className="font-mono text-[10px] text-ink-3">j / k</span>
            </div>
            <ul className="max-h-[70vh] overflow-y-auto">
              {items.map((application) => {
                const active = application.id === selected.id
                return (
                  <li key={application.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(application.id)}
                      aria-current={active}
                      className={`flex w-full items-start gap-2.5 border-b border-line px-4 py-3 text-left transition-colors last:border-0 ${
                        active ? 'bg-accent-soft' : 'hover:bg-sunken'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-0.5 w-0.5 self-stretch rounded-full ${active ? 'bg-accent' : 'bg-transparent'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {application.profile_snapshot.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-3">
                          {application.profile_snapshot.headline ??
                            `${application.profile_snapshot.years_experience} yrs experience`}
                        </span>
                      </span>
                      <ApplicationStatusBadge status={application.status} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          <CandidateDetail
            key={selected.id}
            application={selected}
            job={job}
            pending={update.isPending}
            onMove={(next) => move(selected, next)}
          />
        </div>
      )}
    </div>
  )
}

function CandidateDetail({
  application,
  job,
  pending,
  onMove,
}: {
  application: Application
  job: Job | undefined
  pending: boolean
  onMove: (next: ApplicationStatus) => void
}) {
  const profile = application.profile_snapshot
  const required = job?.required_skills ?? []
  const owned = new Set(profile.skills.map((s) => s.toLowerCase()))
  const matched = required.filter((s) => owned.has(s.toLowerCase()))
  const next = NEXT_STATUSES[application.status]

  return (
    <Card className="animate-fade-in">
      <header className="flex flex-wrap items-start gap-3 border-b border-line p-5">
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line bg-sunken font-mono text-sm font-medium text-ink-2"
        >
          {initials(profile.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">{profile.name}</h2>
          <p className="mt-0.5 text-sm text-ink-2">
            {profile.headline ?? `${profile.years_experience} years of experience`}
          </p>
        </div>
        <ApplicationStatusBadge status={application.status} />
      </header>

      <div className="p-5">
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Meta label="Experience">{profile.years_experience} yrs</Meta>
          <Meta label="Preferred location">{profile.preferred_location ?? '—'}</Meta>
          <Meta label="Preferred type">{profile.preferred_role_type ?? '—'}</Meta>
          <Meta label="Applied">{formatDate(application.created_at)}</Meta>
        </dl>

        {required.length > 0 && (
          <section className="mt-7">
            <div className="flex items-baseline justify-between">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Skill overlap</h3>
              <span className="font-mono text-sm tabular-nums text-ink">
                {matched.length}
                <span className="text-ink-3">/{required.length}</span>
              </span>
            </div>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {required.map((skill) => {
                const has = owned.has(skill.toLowerCase())
                return (
                  <li
                    key={skill}
                    className={`rounded border px-2.5 py-1 text-[13px] ${
                      has ? 'border-good/25 bg-good-soft text-good' : 'border-line bg-sunken text-ink-3'
                    }`}
                  >
                    {skill}
                    <span className="sr-only">{has ? ' — has it' : ' — missing'}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {profile.skills.length > 0 && (
          <section className="mt-7">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">All skills</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{profile.skills.join(' · ')}</p>
          </section>
        )}

        {application.cover_note && (
          <section className="mt-7">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Cover note</h3>
            <p className="mt-2 whitespace-pre-line border-l-2 border-line pl-3 text-[14px] leading-relaxed text-ink-2">
              {application.cover_note}
            </p>
          </section>
        )}

        {profile.education.length > 0 && (
          <section className="mt-7">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Education</h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {profile.education.map((entry, index) => (
                <li key={index} className="text-[14px] text-ink-2">
                  <span className="text-ink">{entry.degree}</span>
                  {entry.field && <> in {entry.field}</>} — {entry.institution}
                  {entry.graduation_year && (
                    <span className="font-mono text-[12px] text-ink-3"> ({entry.graduation_year})</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {profile.projects.length > 0 && (
          <section className="mt-7">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Projects</h3>
            <ul className="mt-2 flex flex-col gap-3">
              {profile.projects.map((project, index) => (
                <li key={index} className="rounded-md border border-line bg-sunken p-3.5">
                  <p className="text-[14px] font-medium text-ink">{project.name}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{project.summary}</p>
                  {project.skills.length > 0 && (
                    <p className="mt-2 font-mono text-[11px] text-ink-3">{project.skills.join(' · ')}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Sticky, because the decision is the point of the page and the profile is long. */}
      <footer className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">
        <span className="text-xs text-ink-3">
          {next.length === 0 ? 'This application is closed.' : 'Move this application:'}
        </span>
        <div className="ml-auto flex gap-2">
          {next.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={status === 'rejected' ? 'danger' : 'primary'}
              loading={pending}
              onClick={() => onMove(status)}
            >
              {status === 'shortlisted' ? 'Shortlist' : 'Reject'}
            </Button>
          ))}
        </div>
      </footer>
    </Card>
  )
}
