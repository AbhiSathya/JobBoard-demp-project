import { Link } from 'react-router-dom'
import type { Job } from '../types'
import { EMPLOYMENT_LABEL, EXPERIENCE_LABEL, initials, relativeTime } from '../lib/format'
import { JobStatusBadge } from './ui/Badge'

const MAX_VISIBLE_SKILLS = 5

export function JobCard({
  job,
  to,
  /** Skills the viewer already has — highlighted so overlap is visible before opening. */
  mySkills = [],
  applied = false,
}: {
  job: Job
  to: string
  mySkills?: string[]
  applied?: boolean
}) {
  const owned = new Set(mySkills.map((s) => s.toLowerCase()))
  const visible = job.required_skills.slice(0, MAX_VISIBLE_SKILLS)
  const overflow = job.required_skills.length - visible.length
  const matched = job.required_skills.filter((s) => owned.has(s.toLowerCase())).length

  return (
    <article className="group relative flex flex-col gap-3.5 rounded-lg border border-line bg-surface p-5 transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_4px_16px_-8px_rgb(20_22_26/0.16)]">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded border border-line bg-sunken font-mono text-[11px] font-medium text-ink-2"
        >
          {initials(job.company_name)}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold tracking-[-0.005em] text-ink">
            {/* Stretched link: the whole card is the target, but only one link is
                announced and the skill chips inside stay selectable. */}
            <Link to={to} className="after:absolute after:inset-0 after:content-['']">
              {job.title}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-[13px] text-ink-2">
            {job.company_name} · {job.location}
          </p>
        </div>

        {job.status === 'closed' ? <JobStatusBadge status={job.status} /> : null}
      </div>

      <p className="line-clamp-2 text-[13px] leading-relaxed text-ink-2">{job.description}</p>

      {job.required_skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visible.map((skill) => {
            const has = owned.has(skill.toLowerCase())
            return (
              <span
                key={skill}
                title={has ? 'On your profile' : undefined}
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  has ? 'border-good/25 bg-good-soft font-medium text-good' : 'border-line bg-sunken text-ink-2'
                }`}
              >
                {skill}
              </span>
            )
          })}
          {overflow > 0 && <span className="px-1 py-0.5 text-[11px] text-ink-3">+{overflow} more</span>}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 font-mono text-[11px] text-ink-3">
        <span>{EXPERIENCE_LABEL[job.experience_level]}</span>
        <Dot />
        <span>{EMPLOYMENT_LABEL[job.employment_type]}</span>
        {job.domain && (
          <>
            <Dot />
            <span className="capitalize">{job.domain}</span>
          </>
        )}
        <span className="ml-auto flex items-center gap-2">
          {mySkills.length > 0 && job.required_skills.length > 0 && (
            <span className={matched > 0 ? 'text-good' : ''}>
              {matched}/{job.required_skills.length} skills
            </span>
          )}
          {applied && <span className="text-accent">Applied</span>}
          {!applied && <span>{relativeTime(job.created_at)}</span>}
        </span>
      </div>
    </article>
  )
}

function Dot() {
  return <span aria-hidden>·</span>
}
