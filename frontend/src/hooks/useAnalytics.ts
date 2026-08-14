import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { AnalyticsResponse } from '../types'

export function useAnalytics() {
  return useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: () => api.get<AnalyticsResponse>('/admin/analytics'),
  })
}
