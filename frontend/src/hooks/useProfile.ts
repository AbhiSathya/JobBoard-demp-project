import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import type { CandidateProfile, EducationEntry, ProjectEntry } from '../types'

export interface ProfileFormValues {
  name: string
  headline?: string
  years_experience: number
  skills: string[]
  education: EducationEntry[]
  projects: ProjectEntry[]
  preferred_location?: string
  preferred_role_type?: string
  domain_interests: string[]
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => api.get<CandidateProfile>('/candidates/me/profile'),
    retry: (failureCount, error) => (error instanceof ApiError && error.status === 404 ? false : failureCount < 1),
  })
}

export function useSaveProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ProfileFormValues) => api.put<CandidateProfile>('/candidates/me/profile', data),
    onSuccess: (data) => queryClient.setQueryData(['profile', 'me'], data),
  })
}
