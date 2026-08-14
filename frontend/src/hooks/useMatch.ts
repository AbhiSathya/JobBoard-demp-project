import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { MatchResponse } from '../types'

export function useMatch() {
  return useMutation({
    mutationFn: (query: string) => api.post<MatchResponse>('/match', { query }),
  })
}
