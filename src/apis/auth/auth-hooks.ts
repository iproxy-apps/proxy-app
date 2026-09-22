import { useMutation } from '@tanstack/react-query'

import { useAuthStore } from '@/store/auth-store'
import { authApis } from './auth-apis'
import type {
  TCreateAccountPayload,
  TSignInPayload,
} from './auth-api-types'

/**
 * Signs an existing user in. On success, persists the JWT to SecureStore and
 * updates the auth-store — route guards then handle the redirect.
 */
export function useSignInMutation() {
  return useMutation({
    mutationFn: async (payload: TSignInPayload) => {
      const { session } = await authApis.session(payload)
      await useAuthStore.getState().setSession(session)
    },
  })
}

/**
 * Creates a new account. Backend returns a signed session so we drop the user
 * straight into the app after signup.
 */
export function useCreateAccountMutation() {
  return useMutation({
    mutationFn: async (payload: TCreateAccountPayload) => {
      const { session } = await authApis.create(payload)
      await useAuthStore.getState().setSession(session)
    },
  })
}

export function useForgotPasswordMutation() {
  return useMutation({ mutationFn: authApis.forgotPassword })
}

export function useVerifyResetCodeMutation() {
  return useMutation({ mutationFn: authApis.verifyResetCode })
}

export function useResetPasswordMutation() {
  return useMutation({ mutationFn: authApis.resetPassword })
}

/**
 * Re-issues the JWT with a fresh snapshot of the user (walletBalance,
 * stripeAccountReady, rating, ...). Called after external flows that mutate
 * the account behind the app's back — most notably the Stripe onboarding
 * return.
 */
export function useRefreshSessionMutation() {
  return useMutation({
    mutationFn: async () => {
      const { session } = await authApis.refreshSession()
      await useAuthStore.getState().setSession(session)
    },
  })
}
