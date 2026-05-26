import { Sparkles } from 'lucide-react-native'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '../../src/components/Button'
import { Logo } from '../../src/components/Logo'
import { useProxyAuth } from '../../src/hooks/useProxyAuth'

const GRAPHITE = 'hsl(220, 10%, 12%)'
const MUTED = 'hsl(220, 8%, 42%)'
const ACCENT = 'hsl(45, 95%, 55%)'
const BG = 'hsl(40, 20%, 97%)'

export default function Home() {
  const { session, signOut } = useProxyAuth()
  const firstName = session?.name?.split(' ')[0] ?? 'por aí'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingTop: 12 }}>
          <Logo color={GRAPHITE} />
        </View>

        <View style={{ marginTop: 32 }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '700',
              color: GRAPHITE,
              letterSpacing: -0.5,
              lineHeight: 34,
            }}
          >
            Olá, {firstName} 👋
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 14,
              color: MUTED,
              lineHeight: 20,
            }}
          >
            Você está logado como{' '}
            <Text style={{ fontWeight: '700', color: GRAPHITE }}>
              {session?.userType === 'PROXY' ? 'Proxy' : 'Cliente'}
            </Text>
            .
          </Text>
        </View>

        <View
          style={{
            marginTop: 28,
            padding: 20,
            borderRadius: 16,
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: 'hsl(40, 10%, 88%)',
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: 'hsla(45, 95%, 55%, 0.15)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Sparkles size={20} color={ACCENT} />
          </View>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: GRAPHITE,
              marginBottom: 4,
            }}
          >
            Sua home está em construção
          </Text>
          <Text style={{ fontSize: 13, color: MUTED, lineHeight: 19 }}>
            Em breve você verá suas tarefas, ganhos e tudo o que importa por
            aqui.
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ marginTop: 24 }}>
          <Button variant="outline" size="lg" fullWidth onPress={signOut}>
            Sair
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
