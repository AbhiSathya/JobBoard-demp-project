import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { JobStatusBadge } from '../../components/ui/Badge'
import { Button, LinkButton } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { EmptyState, ErrorBanner, Skeleton } from '../../components/ui/Feedback'
import { Pagination } from '../../components/ui/Pagination'
import { PageHeader } from '../../components/ui/Surface'
import { useToast } from '../../components/ui/Toast'
import { useDebounced } from '../../hooks/useDebounced'
import { useMyJobs, useSetJobStatus, type JobSort } from '../../hooks/useJobs'
import { EMPLOYMENT_LABEL, EXPERIENCE_LABEL, relativeTime } from '../../lib/format'
import type { JobStatus } from '../../types'

const TABS: { value: JobStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
]

export function AdminJobsPage() {
  const [status, setStatus] = useState<JobStatus | ''>('')
  const [sort, setSort] = useState<JobSort>('newest')
  const [page, setPage] = useState(1)
  const [searchDraft, setSearchDraft] = useState('')
  const search = useDebounced(searchDraft, 300)

  useEffect(() => setPage(1), [status, sort, search])

  const { data, isLoading, isError, refetch, isPlaceholderData } = useMyJobs({ status, search, sort, page })
  const setJobStatus = useSetJobStatus()
  const { show } = useToast()

  function toggle(jobId: number, title: string, current: JobStatus) {
    const next: JobStatus = current === 'open' ? 'closed' : 'open'
    setJobStatus.mutate(
      { jobId, status: next },
      { onSuccess: () => show({ intent: 'success', message: `${title} is now ${next}` }) },
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Employer"
        title="Your postings"
        description="Every role you've posted. Open one to review its applicants."
        action={<LinkButton to="/admin/jobs/new">New posting</LinkButton>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        {/* A segmented control rather than a select: three options, always visible. */}
        <div className="flex rounded-md border border-line-strong bg-surface p-0.5" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              role="tab"
              aria-selected={status === tab.value}
              onClick={() => setStatus(tab.value)}
              className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${
                status === tab.value ? 'bg-accent text-on-accent' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-w-[14rem] flex-1">
          <Input
            placeholder="Search your postings…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            leading={
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10.4 10.4L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            }
          />
        </div>

        <div className="w-40">
          <Select value={sort} onChange={(e) => setSort(e.target.value as JobSort)} aria-label="Sort postings">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      )}

      {isError && <ErrorBanner message="Could not load your postings." onRetry={() => refetch()} />}

      {data && data.items.length === 0 && (
        <EmptyState
          title={search || status ? 'Nothing matches that' : 'No postings yet'}
          description={
            search || status
              ? 'Try a different search, or switch back to All.'
              : 'Post a role and candidates can start applying immediately.'
          }
          action={search || status ? undefined : <LinkButton to="/admin/jobs/new">Create a posting</LinkButton>}
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <div
            className={`overflow-x-auto rounded-lg border border-line bg-surface transition-opacity ${
              isPlaceholderData ? 'opacity-55' : ''
            }`}
          >
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th scope="col" className="px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.12em]">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.12em]">
                    Level / type
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.12em]">
                    Posted
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.12em]">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-mono text-[10px] font-normal uppercase tracking-[0.12em]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((job) => (
                  <tr key={job.id} className="border-b border-line last:border-0 transition-colors hover:bg-sunken">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/jobs/${job.id}/applications`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {job.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-3">{job.location}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[13px] text-ink-2">
                      {EXPERIENCE_LABEL[job.experience_level]} · {EMPLOYMENT_LABEL[job.employment_type]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-ink-3">
                      {relativeTime(job.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <LinkButton to={`/admin/jobs/${job.id}/applications`} variant="ghost" size="sm">
                          Applicants
                        </LinkButton>
                        <LinkButton to={`/admin/jobs/${job.id}/edit`} variant="ghost" size="sm">
                          Edit
                        </LinkButton>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={setJobStatus.isPending}
                          onClick={() => toggle(job.id, job.title, job.status)}
                        >
                          {job.status === 'open' ? 'Close' : 'Reopen'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  )
}
