import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from '../lib/api'
import type { EmploymentType, ExperienceLevel, Job, JobListResponse, JobStatus } from '../types'

export type JobSort = 'newest' | 'oldest' | 'title'

export interface JobFilters {
  search: string
  skills: string[]
  location: string
  experience_level: ExperienceLevel | ''
  employment_type: EmploymentType | ''
  sort: JobSort
  page: number
  page_size: number
}

export const DEFAULT_FILTERS: JobFilters = {
  search: '',
  skills: [],
  location: '',
  experience_level: '',
  employment_type: '',
  sort: 'newest',
  page: 1,
  page_size: 9,
}

export function jobQuery(filters: JobFilters): string {
  return qs({
    search: filters.search,
    skills: filters.skills.join(','),
    location: filters.location,
    experience_level: filters.experience_level,
    employment_type: filters.employment_type,
    sort: filters.sort,
    page: filters.page,
    page_size: filters.page_size,
  })
}

export function useJobs(filters: JobFilters) {
  return useQuery({
    queryKey: ['jobs', 'browse', filters],
    queryFn: () => api.get<JobListResponse>(`/jobs${jobQuery(filters)}`),
    // Paging keeps the previous grid on screen instead of flashing a skeleton.
    placeholderData: keepPreviousData,
  })
}

export function useJob(jobId: number | undefined) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.get<Job>(`/jobs/${jobId}`),
    enabled: jobId !== undefined && !Number.isNaN(jobId),
  })
}

export function useMyJobs(params: { status: JobStatus | ''; search: string; sort: JobSort; page: number }) {
  return useQuery({
    queryKey: ['jobs', 'mine', params],
    queryFn: () =>
      api.get<JobListResponse>(
        `/jobs/mine${qs({ ...params, page_size: 20 })}`,
      ),
    placeholderData: keepPreviousData,
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
    mutationFn: ({ jobId, status }: { jobId: number; status: JobStatus; title?: string }) =>
      api.patch<Job>(`/jobs/${jobId}/status`, { status }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['job', variables.jobId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'analytics'] })
    },
  })
}
