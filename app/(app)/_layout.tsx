import { StripeProvider } from '@stripe/stripe-react-native'
import { router, Stack } from 'expo-router'
import { useEffect } from 'react'

import { env } from '@/common/env'
import { useProxyAuth } from '@/feature/auth/hooks/useProxyAuth'

export default function AppLayout() {
  const { hydrated, isAuthenticated } = useProxyAuth()

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace('/')
    }
  }, [hydrated, isAuthenticated])

  if (!hydrated || !isAuthenticated) return null

  return (
    <StripeProvider publishableKey={env.stripePublishableKey}>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
    </StripeProvider>
  )
}
