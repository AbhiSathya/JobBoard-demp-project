import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, MatchBandBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Field'
import { EmptyState, ErrorBanner, Spinner } from '../../components/ui/Feedback'
import { Card, PageHeader } from '../../components/ui/PageHeader'
import { useMatch } from '../../hooks/useMatch'
import { ApiError } from '../../lib/api'

const EXAMPLE_QUERIES = [
  'I want a Python backend role in a healthcare startup',
  'Senior frontend engineer, remote, fintech',
  'Entry-level data analyst, part-time',
]

export function MatchPage() {
  const [query, setQuery] = useState('')
  const matchMutation = useMatch()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    matchMutation.mutate(query.trim())
  }

  const response = matchMutation.data

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="AI Job Match"
        description="Describe the job you want in your own words — we'll rank open roles and explain each match."
      />

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Textarea
            label="What are you looking for?"
            rows={3}
            placeholder="e.g. I want a Python backend role in a healthcare startup"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
              >
                {example}
              </button>
            ))}
          </div>
          <Button type="submit" disabled={matchMutation.isPending || !query.trim()} className="w-fit">
            {matchMutation.isPending ? 'Matching…' : 'Find matches'}
          </Button>
        </form>
      </Card>

      <div className="mt-6">
        {matchMutation.isPending && <Spinner label="Analyzing your request and scoring open jobs…" />}

        {matchMutation.isError && (
          <ErrorBanner
            message={
              matchMutation.error instanceof ApiError
                ? matchMutation.error.message
                : 'Could not run the match right now. Please try again.'
            }
          />
        )}

        {response && response.results.length === 0 && (
          <EmptyState
            title="No open jobs to match against yet"
            description="Check back once new roles are posted."
          />
        )}

        {response && response.results.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {!response.used_ai && <Badge tone="slate">Deterministic matching (AI not used)</Badge>}
              {response.used_ai && <Badge tone="blue">AI-assisted interpretation</Badge>}
              {response.low_confidence && (
                <Badge tone="amber">Your query was general — results are broader than usual</Badge>
              )}
              {response.weak_matches_only && (
                <Badge tone="amber">No strong matches — showing the closest open roles</Badge>
              )}
            </div>

            {response.results.map((result) => (
              <Card key={result.job.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link to={`/jobs/${result.job.id}`} className="text-base font-semibold text-slate-900 hover:underline">
                      {result.job.title}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {result.job.company_name} · {result.job.location}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <MatchBandBadge band={result.band} />
                    <span className="text-xs text-slate-400">{result.score.toFixed(0)} / 100</span>
                  </div>
                </div>
                <p className="text-sm text-slate-700">{result.explanation}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
