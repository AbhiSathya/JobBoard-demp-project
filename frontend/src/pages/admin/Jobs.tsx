import { useState } from 'react'
import { Link } from 'react-router-dom'
import { JobStatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import { Card, PageHeader } from '../../components/ui/PageHeader'
import { useMyJobs, useSetJobStatus } from '../../hooks/useJobs'
import type { JobStatus } from '../../types'

export function AdminJobsPage() {
  const [statusFilter, setStatusFilter] = useState<JobStatus | ''>('')
  const { data, isLoading, isError } = useMyJobs(statusFilter)
  const setStatus = useSetJobStatus()

  return (
    <div>
      <PageHeader
        title="Your Job Listings"
        description="Create, edit, and manage the status of your postings."
        action={
          <Link to="/admin/jobs/new">
            <Button>New job</Button>
          </Link>
        }
      />

      <div className="mb-4 flex gap-2">
        {(['', 'open', 'closed'] as const).map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 ${
              statusFilter === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {s === '' ? 'All' : s === 'open' ? 'Open' : 'Closed'}
          </button>
        ))}
      </div>

      {isLoading && <Spinner label="Loading your jobs…" />}
      {isError && <ErrorBanner message="Could not load your jobs." />}

      {data && data.items.length === 0 && (
        <EmptyState
          title="No job listings yet"
          description="Create your first listing to start receiving applications."
          action={
            <Link to="/admin/jobs/new">
              <Button variant="secondary">Create a job</Button>
            </Link>
          }
        />
      )}

      {data && data.items.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.items.map((job) => (
            <Card key={job.id} className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-900">{job.title}</p>
                <p className="text-sm text-slate-500">
                  {job.location} · {job.required_skills.slice(0, 3).join(', ')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <JobStatusBadge status={job.status} />
                <Link to={`/admin/jobs/${job.id}/applications`}>
                  <Button variant="secondary">Applications</Button>
                </Link>
                <Link to={`/admin/jobs/${job.id}/edit`}>
                  <Button variant="secondary">Edit</Button>
                </Link>
                <Button
                  variant={job.status === 'open' ? 'danger' : 'primary'}
                  disabled={setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate({ jobId: job.id, status: job.status === 'open' ? 'closed' : 'open' })
                  }
                >
                  {job.status === 'open' ? 'Close' : 'Reopen'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
