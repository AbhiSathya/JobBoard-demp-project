import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApplicationStatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import { Card, PageHeader } from '../../components/ui/PageHeader'
import { useJobApplications, useUpdateApplicationStatus } from '../../hooks/useApplications'
import { useJob } from '../../hooks/useJobs'
import type { Application, ApplicationStatus } from '../../types'

const NEXT_STATUSES: Record<ApplicationStatus, ApplicationStatus[]> = {
  applied: ['shortlisted', 'rejected'],
  shortlisted: ['rejected'],
  rejected: [],
}

function CandidateSnapshot({ application }: { application: Application }) {
  const profile = application.profile_snapshot
  return (
    <div className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-700">
      <p className="font-medium text-slate-900">{profile.name}</p>
      {profile.headline && <p className="text-slate-500">{profile.headline}</p>}
      <p className="mt-1 text-slate-500">{profile.years_experience} years of experience</p>
      {profile.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {profile.skills.map((skill) => (
            <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
              {skill}
            </span>
          ))}
        </div>
      )}
      {profile.education.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Education</p>
          {profile.education.map((edu, i) => (
            <p key={i} className="text-slate-600">
              {edu.degree} in {edu.field ?? 'N/A'}, {edu.institution}
              {edu.graduation_year ? ` (${edu.graduation_year})` : ''}
            </p>
          ))}
        </div>
      )}
      {profile.projects.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Projects</p>
          {profile.projects.map((project, i) => (
            <p key={i} className="text-slate-600">
              <span className="font-medium">{project.name}:</span> {project.summary}
            </p>
          ))}
        </div>
      )}
      {application.cover_note && (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Cover note</p>
          <p className="text-slate-600">{application.cover_note}</p>
        </div>
      )}
    </div>
  )
}

export function AdminJobApplicationsPage() {
  const { jobId } = useParams()
  const numericJobId = jobId ? Number(jobId) : undefined
  const { data: job } = useJob(numericJobId)
  const { data: applications, isLoading, isError } = useJobApplications(numericJobId)
  const updateStatus = useUpdateApplicationStatus()
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div>
      <Link to="/admin/jobs" className="text-sm text-slate-500 hover:underline">
        &larr; Back to jobs
      </Link>
      <PageHeader
        title={job ? `Applications — ${job.title}` : 'Applications'}
        description="Review candidate profiles and move applications through the pipeline."
      />

      {isLoading && <Spinner label="Loading applications…" />}
      {isError && <ErrorBanner message="Could not load applications for this job." />}

      {applications && applications.length === 0 && (
        <EmptyState title="No applications yet" description="Applications will appear here as candidates apply." />
      )}

      {applications && applications.length > 0 && (
        <div className="flex flex-col gap-3">
          {applications.map((application) => {
            const isOpen = expanded === application.id
            const nextStatuses = NEXT_STATUSES[application.status]
            return (
              <Card key={application.id}>
                <div className="flex items-center justify-between gap-4">
                  <button
                    className="rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                    onClick={() => setExpanded(isOpen ? null : application.id)}
                  >
                    <p className="font-medium text-slate-900">{application.profile_snapshot.name}</p>
                    <p className="text-sm text-slate-500">
                      Applied {new Date(application.created_at).toLocaleDateString()} ·{' '}
                      {isOpen ? 'Hide details' : 'View details'}
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    <ApplicationStatusBadge status={application.status} />
                    {nextStatuses.map((status) => (
                      <Button
                        key={status}
                        variant={status === 'rejected' ? 'danger' : 'primary'}
                        disabled={updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ applicationId: application.id, status })}
                      >
                        {status === 'shortlisted' ? 'Shortlist' : 'Reject'}
                      </Button>
                    ))}
                  </div>
                </div>
                {isOpen && <CandidateSnapshot application={application} />}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
