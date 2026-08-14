import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { ErrorBanner, Spinner } from '../../components/ui/Feedback'
import { Card, PageHeader } from '../../components/ui/PageHeader'
import { useCreateJob, useJob, useUpdateJob } from '../../hooks/useJobs'
import { ApiError } from '../../lib/api'

const schema = z.object({
  title: z.string().min(1, 'Title is required.').max(255),
  description: z.string().min(1, 'Description is required.').max(10_000),
  required_skills: z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  experience_level: z.enum(['entry', 'mid', 'senior', 'lead']),
  location: z.string().min(1, 'Location is required.').max(255),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'internship']),
  domain: z.string().optional(),
})

type FormValues = z.input<typeof schema>
type SubmitValues = z.output<typeof schema>

export function AdminJobFormPage() {
  const { jobId } = useParams()
  const isEditing = Boolean(jobId)
  const navigate = useNavigate()
  const { data: existingJob, isLoading } = useJob(jobId ? Number(jobId) : undefined)
  const createJob = useCreateJob()
  const updateJob = useUpdateJob(jobId ? Number(jobId) : 0)

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, SubmitValues>({
    resolver: zodResolver(schema),
    defaultValues: { experience_level: 'mid', employment_type: 'full_time', required_skills: '' },
  })

  useEffect(() => {
    if (existingJob) {
      reset({
        title: existingJob.title,
        description: existingJob.description,
        required_skills: existingJob.required_skills.join(', '),
        experience_level: existingJob.experience_level,
        location: existingJob.location,
        employment_type: existingJob.employment_type,
        domain: existingJob.domain ?? '',
      })
    }
  }, [existingJob, reset])

  async function onSubmit(values: SubmitValues) {
    try {
      if (isEditing) {
        await updateJob.mutateAsync(values)
      } else {
        await createJob.mutateAsync(values)
      }
      navigate('/admin/jobs')
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? err.message : 'Could not save this job.' })
    }
  }

  if (isEditing && isLoading) return <Spinner label="Loading job…" />

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={isEditing ? 'Edit Job' : 'Create Job'} />

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {errors.root && <ErrorBanner message={errors.root.message ?? 'Something went wrong.'} />}
          <Input label="Title" required error={errors.title?.message} {...register('title')} />
          <Textarea
            label="Description"
            rows={6}
            required
            error={errors.description?.message}
            {...register('description')}
          />
          <Input
            label="Required skills"
            hint="Comma-separated, e.g. Python, FastAPI, PostgreSQL"
            {...register('required_skills')}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Experience level" required {...register('experience_level')}>
              <option value="entry">Entry</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
            </Select>
            <Select label="Employment type" required {...register('employment_type')}>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
            </Select>
          </div>
          <Input label="Location" required error={errors.location?.message} {...register('location')} />
          <Input label="Domain" placeholder="e.g. Healthcare, Fintech" {...register('domain')} />

          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Create job'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/admin/jobs')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
