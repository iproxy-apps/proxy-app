import { useEffect, type ReactNode } from 'react'

import { registerUnauthorizedHandler } from '../lib/api/client'
import { getToken } from '../lib/secure-store'
import { useAuthStore } from '../store/auth-store'

type Props = {
  children: ReactNode
}

/**
 * Hydrates the auth store from SecureStore on app boot and wires the global
 * 401 handler to clear the session. The (app)/_layout guard handles the
 * redirect once the session is cleared.
 */
export function SessionProvider({ children }: Props) {
  const hydrate = useAuthStore((s) => s.hydrate)
  const clearSession = useAuthStore((s) => s.clearSession)

  useEffect(() => {
    let cancelled = false

    getToken().then((token) => {
      if (!cancelled) hydrate(token)
    })

    registerUnauthorizedHandler(() => {
      void clearSession()
    })

    return () => {
      cancelled = true
    }
  }, [hydrate, clearSession])

  return <>{children}</>
}
