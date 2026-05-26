import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AppModal } from '../src/components/AppModal'
import { SessionProvider } from '../src/providers/SessionProvider'

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
      </SessionProvider>
    </SafeAreaProvider>
  )
}
