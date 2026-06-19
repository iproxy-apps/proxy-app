import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AppModal } from '@/shared/components/AppModal'
import { Toast } from '@/shared/components/Toast'
import { SessionProvider } from '@/shared/providers/SessionProvider'

import '../global.css'

export default function RootLayout() {
  return (
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
  )
}
