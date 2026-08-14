import { useEffect, useRef, useState } from 'react'
import { MatchCard } from '../../components/MatchCard'
import { Button, LinkButton } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Field'
import { EmptyState, ErrorBanner, Skeleton } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/Surface'
import { useToast } from '../../components/ui/Toast'
import { useMatch } from '../../hooks/useMatch'
import { useProfile } from '../../hooks/useProfile'
import type { MatchIntent, MatchResponse } from '../../types'

/** Cold-start prompts. A blank box with no examples is the fastest way to make a
 *  search feature look broken — these show the shape of query the parser handles. */
const EXAMPLES = [
  'Senior Python role in healthcare, remote',
  'Entry-level frontend job with React and TypeScript',
  'Contract data engineering work in fintech',
  'Mid-level backend role, Berlin, Go or Rust',
]

export function MatchPage() {
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const { show } = useToast()
  const { data: profile } = useProfile()
  const match = useMatch()
  const data = match.data

  function run(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    match.mutate(trimmed, {
      onSuccess: (response) => {
        if (response.ai_status === 'fallback') {
          show({ intent: 'info', message: 'AI unavailable — ranked with offline matching' })
        }
      },
    })
  }

  function applyExample(example: string) {
    setQuery(example)
    boxRef.current?.focus()
    run(example)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Candidate"
        title="AI match"
        description="Describe the role you're after in your own words. Your profile is scored against every open job, and each result shows exactly where its points came from."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(query)
        }}
        className="rounded-lg border border-line bg-surface p-5"
      >
        <Textarea
          ref={boxRef}
          label="What are you looking for?"
          rows={3}
          maxLength={1000}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. a senior backend role in healthcare, remote, Python and Postgres"
          hint={
            profile
              ? 'Ranked against the skills and experience on your profile.'
              : 'Add a profile first — matching scores your skills against each role.'
          }
          onKeyDown={(e) => {
            // Enter submits; Shift+Enter keeps the newline, since this is a textarea.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              run(query)
            }
          }}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="submit" loading={match.isPending} disabled={!query.trim()}>
            Match me
          </Button>
          {data && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery('')
                match.reset()
                boxRef.current?.focus()
              }}
            >
              Clear
            </Button>
          )}
          <span className="ml-auto font-mono text-[11px] text-ink-3">Enter to run · Shift+Enter for a new line</span>
        </div>
      </form>

      {!data && !match.isPending && (
        <div className="mt-5">
          <p className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Try one of these</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => applyExample(example)}
                className="rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {match.isPending && (
        <div className="mt-6 flex flex-col gap-3">
          <MatchProgress />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      )}

      {match.isError && (
        <div className="mt-6">
          <ErrorBanner
            message={match.error instanceof Error ? match.error.message : 'Matching failed.'}
            onRetry={() => run(query)}
          />
        </div>
      )}

      {data && !match.isPending && <Results data={data} hasProfile={Boolean(profile)} />}
    </div>
  )
}

/** Two sequential model calls take ten seconds or more on the free tier. Naming the
 *  stage the request is actually in beats a silent skeleton — the wait reads as work
 *  rather than as a hang. The timings are the observed medians, not a real progress feed. */
const STAGES = [
  { at: 0, label: 'Reading your query…' },
  { at: 3500, label: 'Scoring every open role against your profile…' },
  { at: 7000, label: 'Writing the explanations…' },
  { at: 15000, label: 'The model is slow right now — ranking is already done, waiting on wording.' },
]

function MatchProgress() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const id = setInterval(() => setElapsed(Date.now() - started), 500)
    return () => clearInterval(id)
  }, [])

  const stage = [...STAGES].reverse().find((s) => elapsed >= s.at) ?? STAGES[0]

  return (
    <p className="flex items-center gap-2 text-[13px] text-ink-3" aria-live="polite">
      <span
        aria-hidden
        className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-accent"
      />
      {stage.label}
      <span className="font-mono text-[11px] tabular-nums">{(elapsed / 1000).toFixed(0)}s</span>
    </p>
  )
}

function Results({ data, hasProfile }: { data: MatchResponse; hasProfile: boolean }) {
  if (!hasProfile) {
    return (
      <div className="mt-6">
        <EmptyState
          title="Matching needs a profile"
          description="Scores compare your skills, experience and preferences against each role. Add them once and every match after this is instant."
          action={<LinkButton to="/profile">Complete your profile</LinkButton>}
        />
      </div>
    )
  }

  if (data.results.length === 0) {
    return (
      <div className="mt-6">
        <ReadBack data={data} />
        <div className="mt-4">
          <EmptyState
            title="Nothing matched that"
            description={
              data.low_confidence
                ? "That query was hard to parse, so nothing scored. Try naming a skill, a level, or a location — 'senior React role, remote'."
                : 'No open role scored above zero against your profile. Try widening the query, or browse everything on the board.'
            }
            action={<LinkButton to="/jobs" variant="secondary">Browse all roles</LinkButton>}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <ReadBack data={data} />

      {data.low_confidence && (
        <p className="mt-4 rounded-md border border-warn/25 bg-warn-soft px-4 py-2.5 text-[13px] text-warn">
          Not much to go on in that query, so these are ranked mostly on your profile. Naming a skill, level or
          location will sharpen them.
        </p>
      )}

      {data.weak_matches_only && (
        <p className="mt-4 rounded-md border border-line bg-sunken px-4 py-2.5 text-[13px] text-ink-2">
          These are the closest roles on the board, but none of them scored as a solid fit. Worth widening the
          query or checking back as new roles land.
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-3">
        {data.results.map((result, index) => (
          <li
            key={result.job.id}
            className="animate-rise"
            style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
          >
            <MatchCard result={result} rank={index + 1} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What the system understood, said back. If the parse is wrong the user can see
 *  why the ranking is wrong instead of guessing. */
function ReadBack({ data }: { data: MatchResponse }) {
  const terms = intentTerms(data.intent)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-4">
      <p className="text-sm text-ink">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">Read as</span>{' '}
        {terms.length > 0 ? (
          <span className="ml-1 inline-flex flex-wrap gap-1.5 align-middle">
            {terms.map((term) => (
              <span
                key={term}
                className="rounded border border-accent/25 bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent"
              >
                {term}
              </span>
            ))}
          </span>
        ) : (
          <span className="ml-1 text-ink-3">nothing specific — ranked on your profile alone</span>
        )}
      </p>

      <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-ink-3">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${data.ai_status === 'live' ? 'bg-good' : data.ai_status === 'degraded' ? 'bg-warn' : 'bg-ink-3'}`}
        />
        {data.ai_status === 'fallback'
          ? 'Matched offline — AI unavailable'
          : `Matched with ${data.model_used}${data.ai_status === 'degraded' ? ' (partial)' : ''}`}
        <span className="tabular-nums">· {data.latency_ms} ms</span>
      </span>
    </div>
  )
}

function intentTerms(intent: MatchIntent): string[] {
  return [
    ...intent.roles,
    ...intent.skills,
    ...intent.domains,
    ...intent.locations,
    ...(intent.experience_level ? [`${intent.experience_level} level`] : []),
    ...(intent.employment_type ? [intent.employment_type.replace('_', '-')] : []),
  ]
}
