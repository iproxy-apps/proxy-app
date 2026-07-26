import { QueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

/**
 * Whether the given error is worth retrying.
 *
 * Rule: retry network failures, 5xx, and 429 (throttler). Do NOT retry other
 * 4xx — those are business errors (validation, auth, not-found) where a retry
 * would just fail the same way.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false
  if (!isAxiosError(error)) return true
  const status = error.response?.status
  if (!status) return true
  if (status === 429) return true
  if (status >= 500) return true
  return false
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})
