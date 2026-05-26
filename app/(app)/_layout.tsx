import { router, Stack } from 'expo-router'
import { useEffect } from 'react'

import { useProxyAuth } from '../../src/hooks/useProxyAuth'

export default function AppLayout() {
  const { hydrated, isAuthenticated } = useProxyAuth()

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace('/')
    }
  }, [hydrated, isAuthenticated])

  // Render nothing while we wait for hydration or during the redirect.
  if (!hydrated || !isAuthenticated) return null

  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
}
