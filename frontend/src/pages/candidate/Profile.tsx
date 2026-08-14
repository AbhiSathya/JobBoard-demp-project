import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '../../components/ui/Button'
import { Input, Textarea } from '../../components/ui/Field'
import { ErrorBanner, Spinner, SuccessBanner } from '../../components/ui/Feedback'
import { Card, PageHeader } from '../../components/ui/PageHeader'
import { useProfile, useSaveProfile } from '../../hooks/useProfile'
import { ApiError } from '../../lib/api'

const csv = () =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []))

const schema = z.object({
  name: z.string().min(1, 'Name is required.'),
  headline: z.string().optional(),
  years_experience: z.coerce.number().min(0).max(60),
  skills: csv(),
  preferred_location: z.string().optional(),
  preferred_role_type: z.string().optional(),
  domain_interests: csv(),
  education: z
    .array(
      z.object({
        institution: z.string().min(1, 'Institution is required.'),
        degree: z.string().min(1, 'Degree is required.'),
        field: z.string().optional(),
        graduation_year: z.coerce.number().optional(),
      }),
    )
    .default([]),
  projects: z
    .array(
      z.object({
        name: z.string().min(1, 'Project name is required.'),
        summary: z.string().min(1, 'Summary is required.'),
        skills: csv(),
      }),
    )
    .default([]),
})

type FormValues = z.input<typeof schema>
type SubmitValues = z.output<typeof schema>

export function ProfilePage() {
  const { data: profile, isLoading, isError, error } = useProfile()
  const saveMutation = useSaveProfile()
  const [saved, setSaved] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, SubmitValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', years_experience: 0, education: [], projects: [] },
  })

  const educationArray = useFieldArray({ control, name: 'education' })
  const projectsArray = useFieldArray({ control, name: 'projects' })

  useEffect(() => {
    if (profile) {
      reset({
        name: profile.name,
        headline: profile.headline ?? '',
        years_experience: profile.years_experience,
        skills: profile.skills.join(', '),
        preferred_location: profile.preferred_location ?? '',
        preferred_role_type: profile.preferred_role_type ?? '',
        domain_interests: profile.domain_interests.join(', '),
        education: profile.education.map((e) => ({ ...e, field: e.field ?? undefined, graduation_year: e.graduation_year ?? undefined })),
        projects: profile.projects.map((p) => ({ ...p, skills: p.skills.join(', ') })),
      })
    }
  }, [profile, reset])

  async function onSubmit(values: SubmitValues) {
    setSaved(false)
    await saveMutation.mutateAsync(values)
    setSaved(true)
  }

  const notFoundYet = isError && error instanceof ApiError && error.status === 404

  if (isLoading) return <Spinner label="Loading profile…" />

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Your Profile"
        description={notFoundYet ? 'Create your candidate profile to start applying.' : 'Keep this up to date — it is what admins see with every application.'}
      />

      {isError && !notFoundYet && <ErrorBanner message="Could not load your profile." />}
      {saved && <div className="mb-4"><SuccessBanner message="Profile saved." /></div>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <Input label="Full name" required error={errors.name?.message} {...register('name')} />
          <Input label="Headline" placeholder="e.g. Backend engineer" {...register('headline')} />
          <Input
            label="Years of experience"
            type="number"
            min={0}
            max={60}
            error={errors.years_experience?.message}
            {...register('years_experience')}
          />
          <Input label="Skills" hint="Comma-separated, e.g. Python, FastAPI, PostgreSQL" {...register('skills')} />
          <Input label="Preferred location" placeholder="Remote, Berlin…" {...register('preferred_location')} />
          <Input label="Preferred role type" placeholder="Full-time, Part-time…" {...register('preferred_role_type')} />
          <Input label="Domain interests" hint="Comma-separated, e.g. Healthcare, Fintech" {...register('domain_interests')} />
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Education</h2>
            <Button
              type="button"
              variant="secondary"
              onClick={() => educationArray.append({ institution: '', degree: '', field: '', graduation_year: undefined })}
            >
              Add education
            </Button>
          </div>
          {educationArray.fields.length === 0 && <p className="text-sm text-slate-400">No education added yet.</p>}
          {educationArray.fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
              <Input label="Institution" required {...register(`education.${index}.institution`)} error={errors.education?.[index]?.institution?.message} />
              <Input label="Degree" required {...register(`education.${index}.degree`)} error={errors.education?.[index]?.degree?.message} />
              <Input label="Field of study" {...register(`education.${index}.field`)} />
              <Input label="Graduation year" type="number" {...register(`education.${index}.graduation_year`)} />
              <Button type="button" variant="ghost" className="w-fit text-red-600" onClick={() => educationArray.remove(index)}>
                Remove
              </Button>
            </div>
          ))}
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Projects</h2>
            <Button type="button" variant="secondary" onClick={() => projectsArray.append({ name: '', summary: '', skills: '' })}>
              Add project
            </Button>
          </div>
          {projectsArray.fields.length === 0 && <p className="text-sm text-slate-400">No projects added yet.</p>}
          {projectsArray.fields.map((field, index) => (
            <div key={field.id} className="flex flex-col gap-3 border-t border-slate-100 pt-4">
              <Input label="Project name" required {...register(`projects.${index}.name`)} error={errors.projects?.[index]?.name?.message} />
              <Textarea label="Summary" rows={3} required {...register(`projects.${index}.summary`)} error={errors.projects?.[index]?.summary?.message} />
              <Input label="Skills used" hint="Comma-separated" {...register(`projects.${index}.skills`)} />
              <Button type="button" variant="ghost" className="w-fit text-red-600" onClick={() => projectsArray.remove(index)}>
                Remove
              </Button>
            </div>
          ))}
        </Card>

        <Button type="submit" disabled={isSubmitting} className="w-fit">
          {isSubmitting ? 'Saving…' : 'Save profile'}
        </Button>
      </form>
    </div>
  )
}
