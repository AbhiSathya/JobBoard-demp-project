import { Link } from 'react-router-dom'
import type { Job } from '../types'
import { JobStatusBadge } from './ui/Badge'
import { Card } from './ui/PageHeader'

const EXPERIENCE_LABEL: Record<string, string> = {
  entry: 'Entry level',
  mid: 'Mid level',
  senior: 'Senior',
  lead: 'Lead',
}

export function JobCard({ job, to }: { job: Job; to: string }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to={to} className="text-base font-semibold text-slate-900 hover:underline">
            {job.title}
          </Link>
          <p className="text-sm text-slate-500">
            {job.company_name} · {job.location}
          </p>
        </div>
        <JobStatusBadge status={job.status} />
      </div>

      <p className="line-clamp-2 text-sm text-slate-600">{job.description}</p>

      <div className="flex flex-wrap gap-1.5">
        {job.required_skills.slice(0, 6).map((skill) => (
          <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
            {skill}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span>{EXPERIENCE_LABEL[job.experience_level] ?? job.experience_level}</span>
        <span>·</span>
        <span>{job.employment_type.replace('_', '-')}</span>
        {job.domain && (
          <>
            <span>·</span>
            <span className="capitalize">{job.domain}</span>
          </>
        )}
      </div>
    </Card>
  )
}
