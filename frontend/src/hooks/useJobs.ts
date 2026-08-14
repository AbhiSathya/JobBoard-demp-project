import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { EmploymentType, ExperienceLevel, Job, JobListResponse, JobStatus } from '../types'

export interface JobFilters {
  search?: string
  skills?: string
  location?: string
  experience_level?: ExperienceLevel | ''
  status?: JobStatus | ''
}

function toQueryString(params: Record<string, string | undefined | null>): string {
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) usp.set(key, value)
  }
  const qs = usp.toString()
  return qs ? `?${qs}` : ''
}

export function useJobs(filters: JobFilters) {
  return useQuery({
    queryKey: ['jobs', filters],
    queryFn: () => api.get<JobListResponse>(`/jobs${toQueryString({ ...filters })}`),
  })
}

export function useJob(jobId: number | undefined) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.get<Job>(`/jobs/${jobId}`),
    enabled: jobId !== undefined,
  })
}

export function useMyJobs(status: JobStatus | '') {
  return useQuery({
    queryKey: ['jobs', 'mine', status],
    queryFn: () => api.get<JobListResponse>(`/jobs/mine${toQueryString({ status })}`),
  })
}

export interface JobFormValues {
  title: string
  description: string
  required_skills: string[]
  experience_level: ExperienceLevel
  location: string
  employment_type: EmploymentType
  domain?: string
}

export function useCreateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: JobFormValues) => api.post<Job>('/jobs', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

export function useUpdateJob(jobId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<JobFormValues>) => api.patch<Job>(`/jobs/${jobId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['job', jobId] })
    },
  })
}

export function useSetJobStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, status }: { jobId: number; status: JobStatus }) =>
      api.patch<Job>(`/jobs/${jobId}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })
}
