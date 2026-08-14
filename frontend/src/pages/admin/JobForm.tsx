import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '../../components/ui/Button'
import { ChipInput, Input, Select, Textarea } from '../../components/ui/Field'
import { Skeleton } from '../../components/ui/Feedback'
import { Card, PageHeader } from '../../components/ui/Surface'
import { useToast } from '../../components/ui/Toast'
import { useCreateJob, useJob, useUpdateJob } from '../../hooks/useJobs'
import { EMPLOYMENT_LABEL, EXPERIENCE_LABEL } from '../../lib/format'

const schema = z.object({
  title: z.string().min(1, 'Title is required.').max(255),
  description: z.string().min(1, 'Description is required.').max(10_000),
  required_skills: z.array(z.string()).min(1, 'Add at least one skill — this is what matching scores against.'),
  experience_level: z.enum(['entry', 'mid', 'senior', 'lead']),
  location: z.string().min(1, 'Location is required.').max(255),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'internship']),
  domain: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function AdminJobFormPage() {
  const { jobId } = useParams()
  const id = jobId ? Number(jobId) : undefined
  const isEditing = id !== undefined
  const navigate = useNavigate()
  const { show } = useToast()

  const { data: existing, isLoading } = useJob(id)
  const createJob = useCreateJob()
  const updateJob = useUpdateJob(id ?? 0)

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      required_skills: [],
      experience_level: 'mid',
      location: '',
      employment_type: 'full_time',
      domain: '',
    },
  })

  useEffect(() => {
    if (!existing) return
    reset({
      title: existing.title,
      description: existing.description,
      required_skills: existing.required_skills,
      experience_level: existing.experience_level,
      location: existing.location,
      employment_type: existing.employment_type,
      domain: existing.domain ?? '',
    })
  }, [existing, reset])

  async function onSubmit(values: FormValues) {
    if (isEditing) {
      await updateJob.mutateAsync(values)
      show({ intent: 'success', message: 'Changes saved' })
      navigate('/admin/jobs')
    } else {
      const job = await createJob.mutateAsync(values)
      show({
        intent: 'success',
        message: `${job.title} posted`,
        action: { label: 'View', onClick: () => navigate(`/jobs/${job.id}`) },
      })
      navigate('/admin/jobs')
    }
  }

  if (isEditing && isLoading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    )
  }

  const skills = watch('required_skills')

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Employer"
        title={isEditing ? 'Edit posting' : 'New posting'}
        description="Required skills drive matching — they carry 40 of the 100 points a candidate can score."
      />

      <Card className="p-5">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Input
            label="Title"
            placeholder="Senior Backend Engineer"
            error={errors.title?.message}
            {...register('title')}
          />

          <Textarea
            label="Description"
            rows={8}
            placeholder="What the role does, who it works with, and what success looks like."
            error={errors.description?.message}
            {...register('description')}
          />

          <Controller
            control={control}
            name="required_skills"
            render={({ field }) => (
              <ChipInput
                label="Required skills"
                value={field.value}
                onChange={field.onChange}
                error={errors.required_skills?.message}
                hint={
                  skills.length
                    ? `${skills.length} skill${skills.length === 1 ? '' : 's'} — candidates are scored on how many they have.`
                    : 'Add a skill and press Enter.'
                }
                placeholder="Python, PostgreSQL…"
              />
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Experience level" {...register('experience_level')}>
              {Object.entries(EXPERIENCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select label="Employment type" {...register('employment_type')}>
              {Object.entries(EMPLOYMENT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Input
              label="Location"
              placeholder="Remote, Berlin…"
              error={errors.location?.message}
              {...register('location')}
            />
            <Input
              label="Domain"
              placeholder="healthcare, fintech…"
              hint="Optional. Used when a candidate names an industry."
              {...register('domain')}
            />
          </div>

          <div className="mt-2 flex gap-2 border-t border-line pt-4">
            <Button type="submit" loading={isSubmitting}>
              {isEditing ? 'Save changes' : 'Post role'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate('/admin/jobs')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
