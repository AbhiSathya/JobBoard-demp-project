import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Application, ApplicationStatus } from '../types'

export function useMyApplications() {
  return useQuery({
    queryKey: ['applications', 'me'],
    queryFn: () => api.get<Application[]>('/applications/me'),
  })
}

export function useJobApplications(jobId: number | undefined) {
  return useQuery({
    queryKey: ['applications', 'job', jobId],
    queryFn: () => api.get<Application[]>(`/jobs/${jobId}/applications`),
    enabled: jobId !== undefined,
  })
}

export function useApplyToJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, coverNote }: { jobId: number; coverNote?: string }) =>
      api.post<Application>('/applications', { job_id: jobId, cover_note: coverNote || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  })
}

export function useUpdateApplicationStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ applicationId, status }: { applicationId: number; status: ApplicationStatus }) =>
      api.patch<Application>(`/applications/${applicationId}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  })
}
