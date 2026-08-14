import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qs } from '../lib/api'
import type { Application, ApplicationListResponse, ApplicationStatus } from '../types'

export function useMyApplications(page = 1) {
  return useQuery({
    queryKey: ['applications', 'me', page],
    queryFn: () => api.get<ApplicationListResponse>(`/applications/me${qs({ page, page_size: 20 })}`),
    placeholderData: keepPreviousData,
  })
}

export function useJobApplications(
  jobId: number | undefined,
  params: { status: ApplicationStatus | ''; page: number } = { status: '', page: 1 },
) {
  return useQuery({
    queryKey: ['applications', 'job', jobId, params],
    queryFn: () =>
      api.get<ApplicationListResponse>(
        `/jobs/${jobId}/applications${qs({ ...params, page_size: 50 })}`,
      ),
    enabled: jobId !== undefined && !Number.isNaN(jobId),
    placeholderData: keepPreviousData,
  })
}

export function useApplyToJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, coverNote }: { jobId: number; coverNote?: string; jobTitle?: string }) =>
      api.post<Application>('/applications', { job_id: jobId, cover_note: coverNote || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  })
}

export function useUpdateApplicationStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      applicationId,
      status,
    }: {
      applicationId: number
      status: ApplicationStatus
      candidateName?: string
    }) => api.patch<Application>(`/applications/${applicationId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'analytics'] })
    },
  })
}
