import type { ApiErrorBody } from '../types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class ApiError extends Error {
  code: string
  status: number
  details: unknown[]
  requestId?: string

  constructor(status: number, code: string, message: string, details: unknown[] = [], requestId?: string) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }
}

/* --- access token -----------------------------------------------------------
   Kept in a module variable rather than localStorage. The refresh token lives in
   an httpOnly cookie the browser sends automatically and JavaScript cannot read,
   so a page reload restores the session via /auth/refresh instead of by reading a
   long-lived credential out of storage. */

let accessToken: string | null = null
let onSessionLost: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function onSessionExpired(handler: () => void) {
  onSessionLost = handler
}

/** One shared refresh promise, so ten concurrent 401s trigger one refresh, not ten. */
let refreshInFlight: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) return false
      const body = (await response.json()) as { access_token: string }
      accessToken = body.access_token
      return true
    } catch {
      return false
    } finally {
      // Cleared on the next tick so everyone awaiting this attempt shares its result.
      setTimeout(() => {
        refreshInFlight = null
      }, 0)
    }
  })()
  return refreshInFlight
}

async function send(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  })
}

async function request<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
  let response: Response
  try {
    response = await send(path, init)
  } catch {
    throw new ApiError(0, 'network_error', "Can't reach the server. Check your connection.")
  }

  // A 15-minute access token expiring mid-session is normal, not an error: refresh
  // once and replay the request. Only a failed refresh is a real sign-out.
  if (response.status === 401 && !isRetry && !path.startsWith('/auth/refresh')) {
    if (await refreshAccessToken()) return request<T>(path, init, true)
    if (accessToken !== null) {
      accessToken = null
      onSessionLost?.()
    }
  }

  if (response.status === 204) return undefined as T

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null
    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? 'unknown_error',
      errorBody?.error?.message ?? 'Something went wrong.',
      errorBody?.error?.details ?? [],
      errorBody?.error?.request_id ?? response.headers.get('X-Request-ID') ?? undefined,
    )
  }

  return body as T
}

const withBody = (method: string) => (path: string, data?: unknown) =>
  request(path, { method, body: data !== undefined ? JSON.stringify(data) : undefined })

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => withBody('POST')(path, data) as Promise<T>,
  put: <T>(path: string, data?: unknown) => withBody('PUT')(path, data) as Promise<T>,
  patch: <T>(path: string, data?: unknown) => withBody('PATCH')(path, data) as Promise<T>,
  refresh: refreshAccessToken,
}

/** Turn filter objects into a query string, dropping anything empty. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') usp.set(key, String(value))
  }
  const query = usp.toString()
  return query ? `?${query}` : ''
}
