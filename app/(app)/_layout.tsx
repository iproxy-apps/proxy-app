import { StripeProvider } from '@stripe/stripe-react-native'
import { router, Stack } from 'expo-router'
import { useEffect } from 'react'

import { useProxyAuth } from '@/feature/auth/hooks/useProxyAuth'

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY

export default function AppLayout() {
  const { hydrated, isAuthenticated } = useProxyAuth()

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace('/')
    }
  }, [hydrated, isAuthenticated])

  if (!hydrated || !isAuthenticated) return null

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY ?? ''}>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
    </StripeProvider>
  )
}
