import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { MatchResult, ScoreComponent } from '../types'
import { EMPLOYMENT_LABEL, EXPERIENCE_LABEL, initials } from '../lib/format'
import { MatchBandBadge } from './ui/Badge'
import { ScoreRing } from './ScoreRing'

/** The scorer's weights, mirrored here so the breakdown shows points earned out of
 *  points available rather than a bare 0–1 ratio. Kept in sync with
 *  backend/app/matching/weights.py. */
const WEIGHTS: Record<ScoreComponent, number> = {
  skills: 40,
  role: 20,
  domain: 15,
  experience: 10,
  location: 10,
  employment_type: 5,
}

const COMPONENT_LABEL: Record<ScoreComponent, string> = {
  skills: 'Skills',
  role: 'Role title',
  domain: 'Domain',
  experience: 'Experience',
  location: 'Location',
  employment_type: 'Contract type',
}

const ORDER: ScoreComponent[] = ['skills', 'role', 'domain', 'experience', 'location', 'employment_type']

export function MatchCard({ result, rank }: { result: MatchResult; rank: number }) {
  const [open, setOpen] = useState(false)
  const { job } = result

  return (
    <article className="rounded-lg border border-line bg-surface transition-colors hover:border-line-strong">
      <div className="flex items-start gap-4 p-5">
        <div className="flex flex-col items-center gap-2">
          <ScoreRing score={result.score} />
          <span className="font-mono text-[10px] uppercase tracking-wide text-ink-3">#{rank}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold text-ink">
                <Link to={`/jobs/${job.id}`} className="hover:text-accent">
                  {job.title}
                </Link>
              </h3>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-ink-2">
                <span
                  aria-hidden
                  className="grid h-4 w-4 place-items-center rounded-sm border border-line bg-sunken font-mono text-[8px] text-ink-3"
                >
                  {initials(job.company_name)}
                </span>
                {job.company_name} · {job.location}
              </p>
            </div>
            <MatchBandBadge band={result.band} />
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{result.explanation}</p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {result.skills_matched.map((skill) => (
              <span
                key={skill}
                className="rounded border border-good/25 bg-good-soft px-2 py-0.5 text-[11px] font-medium text-good"
              >
                {skill}
              </span>
            ))}
            {result.skills_missing.map((skill) => (
              <span
                key={skill}
                className="rounded border border-line px-2 py-0.5 text-[11px] text-ink-3 line-through decoration-ink-3/40"
              >
                {skill}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
            <span className="font-mono text-[11px] text-ink-3">
              {EXPERIENCE_LABEL[job.experience_level]} · {EMPLOYMENT_LABEL[job.employment_type]}
              {job.domain && <span className="capitalize"> · {job.domain}</span>}
            </span>

            <span
              className="ml-auto flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink-3"
              title={
                result.explanation_source === 'ai'
                  ? 'Rewritten by the model, then checked against the score breakdown'
                  : 'Generated from the score breakdown'
              }
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${result.explanation_source === 'ai' ? 'bg-accent' : 'bg-ink-3'}`}
              />
              {result.explanation_source === 'ai' ? 'AI wording' : 'Rule wording'}
            </span>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="text-[11px] font-medium text-accent hover:underline"
            >
              {open ? 'Hide breakdown' : 'Why this score?'}
            </button>
          </div>

          {open && (
            <div className="animate-fade-in mt-3 rounded-md border border-line bg-sunken p-4">
              <table className="w-full text-[12px]">
                <caption className="sr-only">Score breakdown by component</caption>
                <tbody>
                  {ORDER.map((component) => {
                    const ratio = result.breakdown[component] ?? 0
                    const earned = ratio * WEIGHTS[component]
                    return (
                      <tr key={component}>
                        <th scope="row" className="py-1 pr-3 text-left font-normal text-ink-2">
                          {COMPONENT_LABEL[component]}
                        </th>
                        <td className="w-full py-1">
                          <span aria-hidden className="block h-1.5 rounded-full bg-line">
                            <span
                              className="block h-full rounded-full bg-accent transition-[width] duration-500"
                              style={{ width: `${ratio * 100}%` }}
                            />
                          </span>
                        </td>
                        <td className="whitespace-nowrap py-1 pl-3 text-right font-mono tabular-nums text-ink">
                          {earned.toFixed(1)}
                          <span className="text-ink-3">/{WEIGHTS[component]}</span>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="border-t border-line">
                    <th scope="row" className="pt-2 pr-3 text-left font-medium text-ink">
                      Total
                    </th>
                    <td />
                    <td className="pt-2 pl-3 text-right font-mono font-medium tabular-nums text-ink">
                      {result.score.toFixed(1)}
                      <span className="text-ink-3">/100</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
