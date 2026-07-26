import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { useAuthStore } from '@/store/auth-store'

/**
 * Reads current auth state and exposes signOut. Sign-in and sign-up are done
 * via the auth mutation hooks (useSignInMutation / useCreateAccountMutation)
 * so screens get isPending, error and retry for free.
 *
 * Navigation is handled declaratively via route guards in (auth)/_layout and
 * (app)/_layout — we don't call router.replace from here to avoid loops.
 */
export function useProxyAuth() {
  const queryClient = useQueryClient()
  const session = useAuthStore((s) => s.session)
  const token = useAuthStore((s) => s.token)
  const hydrated = useAuthStore((s) => s.hydrated)
  const clearSession = useAuthStore((s) => s.clearSession)

  const signOut = useCallback(async () => {
    await clearSession()
    queryClient.clear()
  }, [clearSession, queryClient])

  return {
    session,
    token,
    hydrated,
    isAuthenticated: !!token,
    signOut,
  }
}
