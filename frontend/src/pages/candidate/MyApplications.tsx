import { Link } from 'react-router-dom'
import { ApplicationStatusBadge } from '../../components/ui/Badge'
import { EmptyState, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import { Card, PageHeader } from '../../components/ui/PageHeader'
import { useMyApplications } from '../../hooks/useApplications'

export function MyApplicationsPage() {
  const { data, isLoading, isError } = useMyApplications()

  return (
    <div>
      <PageHeader title="My Applications" description="Track the status of every job you've applied to." />

      {isLoading && <Spinner label="Loading applications…" />}
      {isError && <ErrorBanner message="Could not load your applications." />}

      {data && data.length === 0 && (
        <EmptyState
          title="You haven't applied to any jobs yet"
          description="Browse open roles or try the AI match tool to find a good fit."
        />
      )}

      {data && data.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.map((application) => (
            <Card key={application.id} className="flex items-center justify-between gap-4">
              <div>
                <Link to={`/jobs/${application.job_id}`} className="font-medium text-slate-900 hover:underline">
                  {application.job?.title ?? `Job #${application.job_id}`}
                </Link>
                <p className="text-sm text-slate-500">
                  {application.job?.company_name} · Applied{' '}
                  {new Date(application.created_at).toLocaleDateString()}
                </p>
              </div>
              <ApplicationStatusBadge status={application.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
