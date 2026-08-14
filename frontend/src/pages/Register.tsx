import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Field'
import { ErrorBanner } from '../components/ui/Feedback'

const schema = z
  .object({
    email: z.string().email('Enter a valid email address.'),
    password: z.string().min(8, 'Use at least 8 characters.'),
    role: z.enum(['candidate', 'admin']),
    company_name: z.string().optional(),
  })
  .refine((data) => data.role !== 'admin' || !!data.company_name?.trim(), {
    message: 'Company name is required for an admin account.',
    path: ['company_name'],
  })

type FormValues = z.infer<typeof schema>

export function RegisterPage() {
  const { register: registerUser } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { role: 'candidate' } })

  const role = watch('role')

  async function onSubmit(values: FormValues) {
    setServerError(null)
    try {
      const user = await registerUser(values.email, values.password, values.role, values.company_name)
      navigate(user.role === 'admin' ? '/admin' : '/jobs')
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not create account.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Create an account</h1>
        <p className="mt-1 text-sm text-slate-500">Job Board with AI-Powered Candidate Matching</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {serverError && <ErrorBanner message={serverError} />}
          <Select label="I am a…" error={errors.role?.message} {...register('role')}>
            <option value="candidate">Candidate</option>
            <option value="admin">Company Admin</option>
          </Select>
          {role === 'admin' && (
            <Input label="Company name" error={errors.company_name?.message} {...register('company_name')} />
          )}
          <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters."
            error={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" disabled={isSubmitting} className="mt-2">
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-slate-900 underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
