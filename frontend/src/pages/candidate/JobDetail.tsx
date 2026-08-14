import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { JobStatusBadge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Field'
import { EmptyState, ErrorBanner, Skeleton } from '../../components/ui/Feedback'
import { Card, Meta } from '../../components/ui/Surface'
import { useToast } from '../../components/ui/Toast'
import { useApplyToJob, useMyApplications } from '../../hooks/useApplications'
import { useJob } from '../../hooks/useJobs'
import { useProfile } from '../../hooks/useProfile'
import { ApiError } from '../../lib/api'
import { EMPLOYMENT_LABEL, EXPERIENCE_LABEL, formatDate, initials } from '../../lib/format'
import { useAuth } from '../../lib/auth'

export function JobDetailPage() {
  const { jobId } = useParams()
  const id = Number(jobId)
  const navigate = useNavigate()
  const { show } = useToast()
  const { user } = useAuth()

  const { data: job, isLoading, isError, error } = useJob(id)
  const { data: profile } = useProfile()
  const { data: applications } = useMyApplications(1)
  const apply = useApplyToJob()

  const [coverNote, setCoverNote] = useState('')

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (isError || !job) {
    const notFound = error instanceof ApiError && error.status === 404
    return notFound ? (
      <EmptyState
        title="That role doesn't exist"
        description="It may have been removed, or the link is wrong."
        action={<LinkButton to="/jobs">Back to browse</LinkButton>}
      />
    ) : (
      <ErrorBanner message={error instanceof Error ? error.message : 'Could not load this role.'} />
    )
  }

  const existing = applications?.items.find((a) => a.job_id === job.id)
  const owned = new Set((profile?.skills ?? []).map((s) => s.toLowerCase()))
  const matched = job.required_skills.filter((s) => owned.has(s.toLowerCase()))
  const missing = job.required_skills.filter((s) => !owned.has(s.toLowerCase()))
  const closed = job.status === 'closed'

  async function submit() {
    try {
      await apply.mutateAsync({ jobId: job!.id, coverNote })
      show({
        intent: 'success',
        message: `Applied to ${job!.title} at ${job!.company_name}`,
        action: { label: 'View application', onClick: () => navigate('/applications') },
      })
    } catch (err) {
      // The global handler already toasted; only the profile case needs a route out.
      if (err instanceof ApiError && err.details.includes('profile_required')) {
        show({
          intent: 'warning',
          message: 'Complete your profile first',
          detail: 'Applications send a snapshot of your profile.',
          action: { label: 'Go to profile', onClick: () => navigate('/profile') },
        })
      }
    }
  }

  return (
    <div>
      <Link to="/jobs" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-accent">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M9.5 3.5L5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All roles
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-line bg-sunken font-mono text-sm font-medium text-ink-2"
            >
              {initials(job.company_name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-[-0.015em] text-ink text-balance">{job.title}</h1>
                <JobStatusBadge status={job.status} />
              </div>
              <p className="mt-1 text-sm text-ink-2">
                {job.company_name} · {job.location}
              </p>
            </div>
          </div>

          <dl className="mt-7 grid grid-cols-2 gap-5 border-y border-line py-5 sm:grid-cols-4">
            <Meta label="Level">{EXPERIENCE_LABEL[job.experience_level]}</Meta>
            <Meta label="Contract">{EMPLOYMENT_LABEL[job.employment_type]}</Meta>
            <Meta label="Domain">
              <span className="capitalize">{job.domain ?? '—'}</span>
            </Meta>
            <Meta label="Posted">{formatDate(job.created_at)}</Meta>
          </dl>

          <section className="mt-7">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">About the role</h2>
            <p className="mt-3 whitespace-pre-line text-[15px] leading-[1.7] text-ink-2">{job.description}</p>
          </section>

          {job.required_skills.length > 0 && (
            <section className="mt-8">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Required skills</h2>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {job.required_skills.map((skill) => {
                  const has = owned.has(skill.toLowerCase())
                  return (
                    <li
                      key={skill}
                      className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-[13px] ${
                        has ? 'border-good/25 bg-good-soft text-good' : 'border-line bg-sunken text-ink-2'
                      }`}
                    >
                      {has && (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                          <path d="M2.5 6.4l2.2 2.2L9.5 3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {skill}
                      <span className="sr-only">{has ? ' — on your profile' : ' — not on your profile'}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>

        {/* Sticky apply panel: the decision stays on screen while the description scrolls. */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Card className="p-5">
            {job.required_skills.length > 0 && profile && (
              <div className="mb-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-ink">Your overlap</h2>
                  <span className="font-mono text-sm tabular-nums text-ink">
                    {matched.length}
                    <span className="text-ink-3">/{job.required_skills.length}</span>
                  </span>
                </div>
                <div className="mt-2 flex gap-1" aria-hidden>
                  {job.required_skills.map((skill) => (
                    <span
                      key={skill}
                      className={`h-1.5 flex-1 rounded-full ${owned.has(skill.toLowerCase()) ? 'bg-good' : 'bg-line'}`}
                    />
                  ))}
                </div>
                {missing.length > 0 && (
                  <p className="mt-2.5 text-xs leading-relaxed text-ink-3">
                    Not on your profile: {missing.join(', ')}
                  </p>
                )}
              </div>
            )}

            {existing ? (
              <div className="rounded-md border border-line bg-sunken p-4 text-center">
                <p className="text-sm font-medium text-ink">You've applied</p>
                <p className="mt-1 text-xs text-ink-3">Status: {existing.status}</p>
                <LinkButton to="/applications" variant="secondary" size="sm" className="mt-3 w-full">
                  View application
                </LinkButton>
              </div>
            ) : closed ? (
              <div className="rounded-md border border-line bg-sunken p-4 text-center">
                <p className="text-sm font-medium text-ink">This role has closed</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-3">
                  It's no longer accepting applications.
                </p>
              </div>
            ) : (
              <>
                <Textarea
                  label="Cover note"
                  rows={5}
                  maxLength={5000}
                  value={coverNote}
                  onChange={(e) => setCoverNote(e.target.value)}
                  placeholder="Optional — a couple of lines on why this role fits."
                  hint={
                    profile
                      ? 'Your profile is attached automatically.'
                      : 'You need a profile before you can apply.'
                  }
                />
                <Button onClick={submit} loading={apply.isPending} className="mt-4 w-full">
                  Apply
                </Button>
                {!user?.is_verified && (
                  <p className="mt-2 text-center text-xs text-warn">Verify your email to apply.</p>
                )}
              </>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}
