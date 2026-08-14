import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import { Card, PageHeader } from '../../components/ui/PageHeader'
import { useAnalytics } from '../../hooks/useAnalytics'

const SERIES_BLUE = '#2a78d6'
const STATUS = {
  applied: { color: '#52514e', label: 'Applied' },
  shortlisted: { color: '#0ca30c', label: 'Shortlisted' },
  rejected: { color: '#d03b3b', label: 'Rejected' },
}

function StatTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-2xl font-semibold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </p>
    </Card>
  )
}

export function AdminDashboardPage() {
  const { data, isLoading, isError } = useAnalytics()

  if (isLoading) return <Spinner label="Loading dashboard…" />
  if (isError || !data) return <ErrorBanner message="Could not load analytics." />

  const noData = data.total_jobs === 0

  return (
    <div>
      <PageHeader title="Dashboard" description="Live metrics computed from your jobs and applications." />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatTile label="Jobs" value={data.total_jobs} />
        <StatTile label="Applications" value={data.total_applications} />
        <StatTile label="Applied" value={data.pipeline_counts.applied} color={STATUS.applied.color} />
        <StatTile label="Shortlisted" value={data.pipeline_counts.shortlisted} color={STATUS.shortlisted.color} />
        <StatTile label="Rejected" value={data.pipeline_counts.rejected} color={STATUS.rejected.color} />
      </div>

      {noData ? (
        <EmptyState
          title="No data yet"
          description="Create a job listing to start seeing applications and analytics here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Applications per job</h2>
            {data.applications_per_job.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No jobs to show yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, data.applications_per_job.length * 40)}>
                <BarChart data={data.applications_per_job} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e7" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} stroke="#a3a29c" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="job_title"
                    width={140}
                    stroke="#a3a29c"
                    fontSize={12}
                    tickLine={false}
                  />
                  <Tooltip cursor={{ fill: '#f5f5f4' }} />
                  <Bar dataKey="count" name="Applications" fill={SERIES_BLUE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Skill distribution across applicants</h2>
            {data.skill_distribution.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No applications yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, Math.min(10, data.skill_distribution.length) * 40)}>
                <BarChart data={data.skill_distribution.slice(0, 10)} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e4e7" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} stroke="#a3a29c" fontSize={12} />
                  <YAxis type="category" dataKey="skill" width={100} stroke="#a3a29c" fontSize={12} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f5f5f4' }} />
                  <Bar dataKey="count" name="Applicants" fill={SERIES_BLUE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
