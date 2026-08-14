import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useFieldArray, useForm, type Control, type FieldErrors } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '../../components/ui/Button'
import { ChipInput, Input, Textarea } from '../../components/ui/Field'
import { ErrorBanner, Skeleton } from '../../components/ui/Feedback'
import { Card, PageHeader } from '../../components/ui/Surface'
import { useToast } from '../../components/ui/Toast'
import { useProfile, useSaveProfile } from '../../hooks/useProfile'
import { ApiError } from '../../lib/api'

const schema = z.object({
  name: z.string().min(1, 'Name is required.'),
  headline: z.string().optional(),
  years_experience: z.coerce.number().min(0, 'Cannot be negative.').max(60, '60 years is the maximum.'),
  skills: z.array(z.string()).default([]),
  preferred_location: z.string().optional(),
  preferred_role_type: z.string().optional(),
  domain_interests: z.array(z.string()).default([]),
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
        skills: z.array(z.string()).default([]),
      }),
    )
    .default([]),
})

type FormValues = z.input<typeof schema>
type SubmitValues = z.output<typeof schema>

const EMPTY: FormValues = {
  name: '',
  headline: '',
  years_experience: 0,
  skills: [],
  preferred_location: '',
  preferred_role_type: '',
  domain_interests: [],
  education: [],
  projects: [],
}

/** Suggestions only — the field accepts anything typed. These are the terms the
 *  seeded job board actually uses, so a new profile lines up with real postings. */
const SKILL_SUGGESTIONS = ['Python', 'TypeScript', 'React', 'FastAPI', 'PostgreSQL', 'AWS', 'Docker', 'SQL']
const DOMAIN_SUGGESTIONS = ['healthcare', 'fintech', 'edtech', 'ecommerce', 'logistics']

/** Named checks, not a percentage pulled from nowhere — the meter can say what is
 *  missing because each slice is a specific thing the matcher reads. */
function completeness(values: FormValues) {
  const checks: { label: string; done: boolean }[] = [
    { label: 'Your name', done: Boolean(values.name?.trim()) },
    { label: 'A headline', done: Boolean(values.headline?.trim()) },
    { label: 'At least 3 skills', done: (values.skills?.length ?? 0) >= 3 },
    { label: 'A preferred location', done: Boolean(values.preferred_location?.trim()) },
    { label: 'A domain interest', done: (values.domain_interests?.length ?? 0) > 0 },
    { label: 'One education entry', done: (values.education?.length ?? 0) > 0 },
    { label: 'One project', done: (values.projects?.length ?? 0) > 0 },
  ]
  const done = checks.filter((c) => c.done).length
  return { checks, done, total: checks.length, percent: Math.round((done / checks.length) * 100) }
}

export function ProfilePage() {
  const { data: profile, isLoading, isError, error } = useProfile()
  const save = useSaveProfile()
  const { show } = useToast()

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues, unknown, SubmitValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  })

  const education = useFieldArray({ control, name: 'education' })
  const projects = useFieldArray({ control, name: 'projects' })

  useEffect(() => {
    if (!profile) return
    reset({
      name: profile.name,
      headline: profile.headline ?? '',
      years_experience: profile.years_experience,
      skills: profile.skills,
      preferred_location: profile.preferred_location ?? '',
      preferred_role_type: profile.preferred_role_type ?? '',
      domain_interests: profile.domain_interests,
      education: profile.education.map((e) => ({
        ...e,
        field: e.field ?? undefined,
        graduation_year: e.graduation_year ?? undefined,
      })),
      projects: profile.projects,
    })
  }, [profile, reset])

  const values = watch()
  const meter = completeness(values)
  const missing = meter.checks.filter((c) => !c.done)

  async function onSubmit(submitted: SubmitValues) {
    const saved = await save.mutateAsync(submitted)
    reset({ ...submitted, headline: saved.headline ?? '' }, { keepValues: true })
    show({ intent: 'success', message: 'Profile saved' })
  }

  // 404 is the expected state for a candidate who hasn't written one yet.
  const isNew = isError && error instanceof ApiError && error.status === 404

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Candidate"
        title={isNew ? 'Create your profile' : 'Your profile'}
        description={
          isNew
            ? 'This is what the matcher scores and what an employer sees with every application.'
            : 'This is what the matcher scores and what an employer sees with every application. Keep it current.'
        }
      />

      {isError && !isNew && <ErrorBanner message="Could not load your profile." />}

      <div className="mb-6 rounded-lg border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink">Profile completeness</h2>
          <span className="font-mono text-sm tabular-nums text-ink">
            {meter.done}
            <span className="text-ink-3">/{meter.total}</span>
          </span>
        </div>
        <div className="mt-2.5 flex gap-1" aria-hidden>
          {meter.checks.map((check) => (
            <span
              key={check.label}
              className={`h-1.5 flex-1 rounded-full transition-colors ${check.done ? 'bg-good' : 'bg-line'}`}
            />
          ))}
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-ink-3">
          {missing.length === 0
            ? 'Everything the matcher reads is filled in.'
            : `Still missing: ${missing.map((c) => c.label.toLowerCase()).join(', ')}.`}
          <span className="sr-only"> Profile is {meter.percent} percent complete.</span>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6 pb-24">
        <Section title="About you" description="The basics an employer reads first.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Full name" required error={errors.name?.message} {...register('name')} />
            <Input
              label="Years of experience"
              type="number"
              min={0}
              max={60}
              error={errors.years_experience?.message}
              {...register('years_experience')}
            />
          </div>
          <Input
            label="Headline"
            placeholder="Backend engineer building payment systems"
            hint="One line. It appears above your name on an application."
            {...register('headline')}
          />
        </Section>

        <Section title="Skills and interests" description="What the matcher scores hardest — skills carry 40 of the 100 points.">
          <Controller
            control={control}
            name="skills"
            render={({ field }) => (
              <ChipInput
                label="Skills"
                value={field.value ?? []}
                onChange={field.onChange}
                placeholder="Add a skill and press Enter"
                suggestions={SKILL_SUGGESTIONS}
              />
            )}
          />
          <Controller
            control={control}
            name="domain_interests"
            render={({ field }) => (
              <ChipInput
                label="Domain interests"
                value={field.value ?? []}
                onChange={field.onChange}
                placeholder="Add a domain and press Enter"
                suggestions={DOMAIN_SUGGESTIONS}
              />
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Preferred location" placeholder="Remote, Berlin…" {...register('preferred_location')} />
            <Input
              label="Preferred role type"
              placeholder="Full-time, Contract…"
              {...register('preferred_role_type')}
            />
          </div>
        </Section>

        <Section
          title="Education"
          description="Optional, but it fills out an application."
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => education.append({ institution: '', degree: '', field: '', graduation_year: undefined })}
            >
              Add entry
            </Button>
          }
        >
          {education.fields.length === 0 ? (
            <p className="text-sm text-ink-3">Nothing added yet.</p>
          ) : (
            education.fields.map((field, index) => (
              <Row key={field.id} index={index} onRemove={() => education.remove(index)} label="education entry">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Institution"
                    error={errors.education?.[index]?.institution?.message}
                    {...register(`education.${index}.institution`)}
                  />
                  <Input
                    label="Degree"
                    error={errors.education?.[index]?.degree?.message}
                    {...register(`education.${index}.degree`)}
                  />
                  <Input label="Field of study" {...register(`education.${index}.field`)} />
                  <Input
                    label="Graduation year"
                    type="number"
                    placeholder="2024"
                    {...register(`education.${index}.graduation_year`)}
                  />
                </div>
              </Row>
            ))
          )}
        </Section>

        <Section
          title="Projects"
          description="Concrete work beats a list of adjectives."
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => projects.append({ name: '', summary: '', skills: [] })}
            >
              Add project
            </Button>
          }
        >
          {projects.fields.length === 0 ? (
            <p className="text-sm text-ink-3">Nothing added yet.</p>
          ) : (
            projects.fields.map((field, index) => (
              <Row key={field.id} index={index} onRemove={() => projects.remove(index)} label="project">
                <Input
                  label="Project name"
                  error={errors.projects?.[index]?.name?.message}
                  {...register(`projects.${index}.name`)}
                />
                <Textarea
                  label="Summary"
                  rows={3}
                  error={errors.projects?.[index]?.summary?.message}
                  {...register(`projects.${index}.summary`)}
                />
                <ProjectSkills control={control} index={index} errors={errors} />
              </Row>
            ))
          )}
        </Section>

        {/* Sticky bar: on a form this long the save button is otherwise off-screen
            exactly when there are unsaved changes. */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 lg:pl-4">
            <span className="text-xs text-ink-3">
              {isDirty ? 'Unsaved changes' : profile ? 'All changes saved' : 'Not saved yet'}
            </span>
            <Button type="submit" loading={isSubmitting} className="ml-auto">
              {isNew ? 'Create profile' : 'Save profile'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card as="section" className="p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
        </div>
        {action}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  )
}

function Row({
  index,
  label,
  onRemove,
  children,
}: {
  index: number
  label: string
  onRemove: () => void
  children: React.ReactNode
}) {
  return (
    <div className="animate-fade-in rounded-md border border-line bg-sunken p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
          {String(index + 1).padStart(2, '0')}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-ink-3 transition-colors hover:text-critical"
          aria-label={`Remove ${label} ${index + 1}`}
        >
          Remove
        </button>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function ProjectSkills({
  control,
  index,
  errors,
}: {
  control: Control<FormValues>
  index: number
  errors: FieldErrors<FormValues>
}) {
  return (
    <Controller
      control={control}
      name={`projects.${index}.skills`}
      render={({ field }) => (
        <ChipInput
          label="Skills used"
          value={field.value ?? []}
          onChange={field.onChange}
          error={errors.projects?.[index]?.skills?.message}
          suggestions={SKILL_SUGGESTIONS}
        />
      )}
    />
  )
}
