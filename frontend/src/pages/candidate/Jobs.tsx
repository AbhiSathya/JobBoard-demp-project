import { useState } from 'react'
import { JobCard } from '../../components/JobCard'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { EmptyState, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { useJobs, type JobFilters } from '../../hooks/useJobs'

const EMPTY_FILTERS: JobFilters = { search: '', skills: '', location: '', experience_level: '' }

export function JobsPage() {
  const [filters, setFilters] = useState<JobFilters>(EMPTY_FILTERS)
  const { data, isLoading, isError, error } = useJobs(filters)

  const hasActiveFilters = Object.values(filters).some(Boolean)

  return (
    <div>
      <PageHeader title="Browse Jobs" description="Open roles across every company on the board." />

      <div className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="Search"
          placeholder="Title, description, skill…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        <Input
          label="Skills"
          placeholder="python, react…"
          value={filters.skills}
          onChange={(e) => setFilters((f) => ({ ...f, skills: e.target.value }))}
        />
        <Input
          label="Location"
          placeholder="Remote, Berlin…"
          value={filters.location}
          onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
        />
        <Select
          label="Experience level"
          value={filters.experience_level}
          onChange={(e) => setFilters((f) => ({ ...f, experience_level: e.target.value as JobFilters['experience_level'] }))}
        >
          <option value="">Any</option>
          <option value="entry">Entry</option>
          <option value="mid">Mid</option>
          <option value="senior">Senior</option>
          <option value="lead">Lead</option>
        </Select>
        {hasActiveFilters && (
          <div className="sm:col-span-2 lg:col-span-4">
            <Button variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
              Reset filters
            </Button>
          </div>
        )}
      </div>

      {isLoading && <Spinner label="Loading jobs…" />}
      {isError && <ErrorBanner message={error instanceof Error ? error.message : 'Could not load jobs.'} />}

      {data && data.items.length === 0 && (
        <EmptyState
          title={hasActiveFilters ? 'No jobs match your filters' : 'No open jobs right now'}
          description={
            hasActiveFilters
              ? 'Try widening your search or resetting filters.'
              : 'Check back soon — new roles are posted regularly.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
                Reset filters
              </Button>
            ) : undefined
          }
        />
      )}

      {data && data.items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((job) => (
            <JobCard key={job.id} job={job} to={`/jobs/${job.id}`} />
          ))}
        </div>
      )}
    </div>
  )
}
