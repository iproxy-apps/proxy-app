import { QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { queryClient } from '@/apis/query-client'
import { AppModal } from '@/shared/components/AppModal'
import { Toast } from '@/shared/components/Toast'
import { SessionProvider } from '@/shared/providers/SessionProvider'

import '../global.css'

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <SessionProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ gestureEnabled: false }} />
          </Stack>
          <StatusBar style="auto" />
          <AppModal />
          <Toast />
        </SessionProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}
