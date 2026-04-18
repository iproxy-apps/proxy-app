import { StatusBar } from 'expo-status-bar'
import { Text, View } from 'react-native'

import './global.css'

export default function App() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="font-semibold text-foreground">Proxy</Text>
      <Text className="mt-1 text-muted-foreground">
        Marketplace de serviços
      </Text>
      <StatusBar style="auto" />
    </View>
  )
}
