import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { JobStatusBadge } from '../../components/ui/Badge'
import { Textarea } from '../../components/ui/Field'
import { ErrorBanner, Spinner, SuccessBanner } from '../../components/ui/Feedback'
import { Card } from '../../components/ui/PageHeader'
import { useApplyToJob } from '../../hooks/useApplications'
import { useJob } from '../../hooks/useJobs'
import { ApiError } from '../../lib/api'

export function JobDetailPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { data: job, isLoading, isError } = useJob(jobId ? Number(jobId) : undefined)
  const applyMutation = useApplyToJob()
  const [coverNote, setCoverNote] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  if (isLoading) return <Spinner label="Loading job…" />
  if (isError || !job) return <ErrorBanner message="This job could not be found." />

  async function handleApply() {
    setFeedback(null)
    try {
      await applyMutation.mutateAsync({ jobId: job!.id, coverNote })
      setFeedback({ type: 'success', message: 'Application submitted! You can track its status under My Applications.' })
    } catch (err) {
      if (err instanceof ApiError && err.details.includes('profile_required')) {
        setFeedback({ type: 'error', message: 'Complete your candidate profile before applying.' })
        return
      }
      setFeedback({ type: 'error', message: err instanceof ApiError ? err.message : 'Could not submit application.' })
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/jobs" className="text-sm text-slate-500 hover:underline">
        &larr; Back to jobs
      </Link>

      <Card className="mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{job.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {job.company_name} · {job.location} · {job.employment_type.replace('_', '-')}
            </p>
          </div>
          <JobStatusBadge status={job.status} />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {job.required_skills.map((skill) => (
            <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
              {skill}
            </span>
          ))}
        </div>

        <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{job.description}</p>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-400">Experience</dt>
            <dd className="font-medium capitalize text-slate-800">{job.experience_level}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Domain</dt>
            <dd className="font-medium capitalize text-slate-800">{job.domain ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Location</dt>
            <dd className="font-medium text-slate-800">{job.location}</dd>
          </div>
        </dl>
      </Card>

      {job.status === 'closed' ? (
        <ErrorBanner message="This job is closed and no longer accepting applications." />
      ) : (
        <Card className="mt-4">
          <h2 className="text-base font-semibold text-slate-900">Apply with your saved profile</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your saved profile will be submitted with this application. You can add an optional note below.
          </p>
          {feedback?.type === 'error' && feedback.message.includes('profile') ? (
            <div className="mt-4 flex flex-col gap-2">
              <ErrorBanner message={feedback.message} />
              <Button variant="secondary" onClick={() => navigate('/profile')} className="w-fit">
                Complete your profile
              </Button>
            </div>
          ) : (
            <>
              {feedback?.type === 'error' && <div className="mt-4"><ErrorBanner message={feedback.message} /></div>}
              {feedback?.type === 'success' && <div className="mt-4"><SuccessBanner message={feedback.message} /></div>}
            </>
          )}
          <div className="mt-4">
            <Textarea
              label="Cover note (optional)"
              rows={3}
              value={coverNote}
              onChange={(e) => setCoverNote(e.target.value)}
              disabled={feedback?.type === 'success'}
            />
          </div>
          <Button
            className="mt-4"
            onClick={handleApply}
            disabled={applyMutation.isPending || feedback?.type === 'success'}
          >
            {applyMutation.isPending ? 'Submitting…' : feedback?.type === 'success' ? 'Applied' : 'Apply now'}
          </Button>
        </Card>
      )}
    </div>
  )
}
