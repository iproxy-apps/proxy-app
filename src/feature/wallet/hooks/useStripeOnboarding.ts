import * as WebBrowser from 'expo-web-browser'
import { useCallback } from 'react'

import { extractErrorMessage } from '@/apis/api-client'
import { useRefreshSessionMutation } from '@/apis/auth/auth-hooks'
import { useCreateMerchantAccountMutation } from '@/apis/wallet/wallet-hooks'
import { toast } from '@/lib/toast'

const RETURN_URL = 'proxyapp://wallet'

/**
 * Orchestrates the Stripe Connect onboarding hop:
 *   1. POST /auth/merchant-account   → get accountLinkUrl
 *   2. WebBrowser.openAuthSessionAsync(url, RETURN_URL) → user finishes at Stripe
 *   3. On return, refresh the JWT so `stripeAccountReady` reflects the webhook
 *
 * Stripe's `account.updated` webhook is what flips `stripeAccountReady` in the
 * DB; the browser closes as soon as Stripe redirects to RETURN_URL, but the
 * webhook may lag a second or two. We still refresh right away — if the field
 * is still false, we tell the user the confirmation is in flight.
 */
export function useStripeOnboarding() {
  const createAccount = useCreateMerchantAccountMutation()
  const refreshSession = useRefreshSessionMutation()

  const start = useCallback(async () => {
    try {
      const { accountLinkUrl } = await createAccount.mutateAsync()

      if (!accountLinkUrl) {
        toast.error(
          'Não conseguimos gerar o link de configuração. Tente novamente.',
        )
        return
      }

      const result = await WebBrowser.openAuthSessionAsync(
        accountLinkUrl,
        RETURN_URL,
      )

      if (result.type === 'cancel' || result.type === 'dismiss') {
        toast.info('Configuração pausada. Você pode retomar quando quiser.')
        return
      }

      await refreshSession.mutateAsync()
      toast.success('Recebimento configurado com sucesso.')
    } catch (e) {
      toast.error(extractErrorMessage(e))
    }
  }, [createAccount, refreshSession])

  return {
    start,
    isPending: createAccount.isPending || refreshSession.isPending,
  }
}
