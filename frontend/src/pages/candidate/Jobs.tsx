import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { JobCard } from '../../components/JobCard'
import { Chip } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ChipInput, Input, Select } from '../../components/ui/Field'
import { EmptyState, ErrorBanner, SkeletonGrid } from '../../components/ui/Feedback'
import { Pagination } from '../../components/ui/Pagination'
import { PageHeader } from '../../components/ui/Surface'
import { useDebounced } from '../../hooks/useDebounced'
import { useJobs, DEFAULT_FILTERS, type JobFilters, type JobSort } from '../../hooks/useJobs'
import { useMyApplications } from '../../hooks/useApplications'
import { useProfile } from '../../hooks/useProfile'
import { EMPLOYMENT_LABEL, EXPERIENCE_LABEL } from '../../lib/format'
import type { EmploymentType, ExperienceLevel } from '../../types'

/** Filters live in the URL, so a filtered view survives a reload and can be shared. */
function readFilters(params: URLSearchParams): JobFilters {
  return {
    search: params.get('search') ?? '',
    skills: (params.get('skills') ?? '').split(',').filter(Boolean),
    location: params.get('location') ?? '',
    experience_level: (params.get('experience_level') ?? '') as JobFilters['experience_level'],
    employment_type: (params.get('employment_type') ?? '') as JobFilters['employment_type'],
    sort: (params.get('sort') ?? 'newest') as JobSort,
    page: Number(params.get('page')) || 1,
    page_size: Number(params.get('page_size')) || DEFAULT_FILTERS.page_size,
  }
}

function writeFilters(filters: JobFilters): Record<string, string> {
  const out: Record<string, string> = {}
  if (filters.search) out.search = filters.search
  if (filters.skills.length) out.skills = filters.skills.join(',')
  if (filters.location) out.location = filters.location
  if (filters.experience_level) out.experience_level = filters.experience_level
  if (filters.employment_type) out.employment_type = filters.employment_type
  if (filters.sort !== 'newest') out.sort = filters.sort
  if (filters.page > 1) out.page = String(filters.page)
  if (filters.page_size !== DEFAULT_FILTERS.page_size) out.page_size = String(filters.page_size)
  return out
}

export function JobsPage() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)

  // The text inputs are local so typing stays instant; only the debounced copy
  // reaches the URL and therefore the query key.
  const [searchDraft, setSearchDraft] = useState(filters.search)
  const [locationDraft, setLocationDraft] = useState(filters.location)
  const debouncedSearch = useDebounced(searchDraft, 300)
  const debouncedLocation = useDebounced(locationDraft, 300)

  function update(patch: Partial<JobFilters>) {
    // Any filter change resets to page 1 — page 4 of the old result set is meaningless.
    const next = { ...filters, ...patch, page: patch.page ?? 1 }
    setParams(writeFilters(next), { replace: true })
  }

  useEffect(() => {
    if (debouncedSearch !== filters.search) update({ search: debouncedSearch })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  useEffect(() => {
    if (debouncedLocation !== filters.location) update({ location: debouncedLocation })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedLocation])

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useJobs(filters)
  const { data: profile } = useProfile()
  const { data: applications } = useMyApplications(1)

  const appliedJobIds = new Set((applications?.items ?? []).map((a) => a.job_id))
  const active = activeChips(filters)

  function reset() {
    setSearchDraft('')
    setLocationDraft('')
    setParams({}, { replace: true })
  }

  return (
    <div>
      <PageHeader
        eyebrow="Candidate"
        title="Browse roles"
        description="Every open role on the board. Skills you already have are marked on each card."
      />

      <div className="mb-5 rounded-lg border border-line bg-surface p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Search"
            placeholder="Title, description, skill…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            leading={
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10.4 10.4L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            }
          />
          <Input
            label="Location"
            placeholder="Remote, Berlin…"
            value={locationDraft}
            onChange={(e) => setLocationDraft(e.target.value)}
          />
          <Select
            label="Experience"
            value={filters.experience_level}
            onChange={(e) => update({ experience_level: e.target.value as ExperienceLevel | '' })}
          >
            <option value="">Any level</option>
            {Object.entries(EXPERIENCE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            label="Contract"
            value={filters.employment_type}
            onChange={(e) => update({ employment_type: e.target.value as EmploymentType | '' })}
          >
            <option value="">Any type</option>
            {Object.entries(EMPLOYMENT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
          <ChipInput
            label="Required skills"
            value={filters.skills}
            onChange={(skills) => update({ skills })}
            placeholder="Add a skill and press Enter"
            suggestions={profile?.skills ?? []}
          />
          <Select label="Sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value as JobSort })}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
          </Select>
        </div>
      </div>

      {active.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">Filtering by</span>
          {active.map((chip) => (
            <Chip
              key={chip.key}
              tone="accent"
              removeLabel={`Remove filter ${chip.label}`}
              onRemove={() => {
                if (chip.key === 'search') setSearchDraft('')
                if (chip.key === 'location') setLocationDraft('')
                update(chip.clear)
              }}
            >
              {chip.label}
            </Chip>
          ))}
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear all
          </Button>
        </div>
      )}

      {isLoading && <SkeletonGrid />}

      {isError && (
        <ErrorBanner
          message={error instanceof Error ? error.message : 'Could not load jobs.'}
          onRetry={() => refetch()}
        />
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          title={active.length ? 'No roles match these filters' : 'No open roles right now'}
          description={
            active.length
              ? 'Try removing a filter, or widen the search terms.'
              : 'New roles get posted regularly — check back soon.'
          }
          action={
            active.length ? (
              <Button variant="secondary" onClick={reset}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <div
            className={`grid grid-cols-1 gap-4 transition-opacity md:grid-cols-2 xl:grid-cols-3 ${
              isPlaceholderData ? 'opacity-55' : ''
            }`}
          >
            {data.items.map((job, index) => (
              <div
                key={job.id}
                className="animate-rise"
                style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}
              >
                <JobCard
                  job={job}
                  to={`/jobs/${job.id}`}
                  mySkills={profile?.skills ?? []}
                  applied={appliedJobIds.has(job.id)}
                />
              </div>
            ))}
          </div>

          <Pagination
            page={data.page}
            pageSize={data.page_size}
            total={data.total}
            onPage={(page) => update({ page })}
            onPageSize={(page_size) => update({ page_size })}
          />
        </>
      )}
    </div>
  )
}

interface ActiveChip {
  key: string
  label: string
  clear: Partial<JobFilters>
}

function activeChips(filters: JobFilters): ActiveChip[] {
  const chips: ActiveChip[] = []
  if (filters.search) chips.push({ key: 'search', label: `"${filters.search}"`, clear: { search: '' } })
  if (filters.location) chips.push({ key: 'location', label: filters.location, clear: { location: '' } })
  if (filters.experience_level)
    chips.push({
      key: 'level',
      label: `${EXPERIENCE_LABEL[filters.experience_level]} level`,
      clear: { experience_level: '' },
    })
  if (filters.employment_type)
    chips.push({
      key: 'type',
      label: EMPLOYMENT_LABEL[filters.employment_type],
      clear: { employment_type: '' },
    })
  for (const skill of filters.skills) {
    chips.push({
      key: `skill-${skill}`,
      label: skill,
      clear: { skills: filters.skills.filter((s) => s !== skill) },
    })
  }
  return chips
}
