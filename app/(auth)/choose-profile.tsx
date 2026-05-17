import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ChooseProfile() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-foreground">Escolher perfil (em breve)</Text>
      </View>
    </SafeAreaView>
  )
}
