import { router, Stack } from 'expo-router'
import { useEffect } from 'react'

import { useProxyAuth } from '@/feature/auth/hooks/useProxyAuth'

export default function AuthLayout() {
  const { hydrated, isAuthenticated } = useProxyAuth()

  useEffect(() => {
    if (hydrated && isAuthenticated) {
      router.replace('/home')
    }
  }, [hydrated, isAuthenticated])

  // Render nothing while we wait for hydration or during the redirect.
  if (!hydrated || isAuthenticated) return null

  return <Stack screenOptions={{ headerShown: false }} />
}
