import { useCallback } from 'react'

import { apis } from '@/apis/apis'
import type {
  TCreateAccountPayload,
  TSignInPayload,
} from '@/apis/auth/auth-api-types'
import { useAuthStore } from '@/store/auth-store'
import { useCardStore } from '@/store/card-store'

/**
 * Single source of truth for authentication actions.
 * Screens stay "dumb" and just call these methods.
 *
 * Navigation is handled declaratively via route guards in (auth)/_layout and
 * (app)/_layout. These methods only mutate auth state — they do NOT call
 * router.replace, to avoid double-navigation loops with the guards.
 */
export function useProxyAuth() {
  const session = useAuthStore((s) => s.session)
  const token = useAuthStore((s) => s.token)
  const hydrated = useAuthStore((s) => s.hydrated)
  const setSession = useAuthStore((s) => s.setSession)
  const clearSession = useAuthStore((s) => s.clearSession)

  const signUp = useCallback(
    async (payload: TCreateAccountPayload) => {
      const { session: token } = await apis.auth.create(payload)
      await setSession(token)
    },
    [setSession],
  )

  const signIn = useCallback(
    async (payload: TSignInPayload) => {
      const { session: token } = await apis.auth.session(payload)
      await setSession(token)
    },
    [setSession],
  )

  const signOut = useCallback(async () => {
    await clearSession()
    useCardStore.getState().reset()
  }, [clearSession])

  return {
    session,
    token,
    hydrated,
    isAuthenticated: !!token,
    signUp,
    signIn,
    signOut,
  }
}
