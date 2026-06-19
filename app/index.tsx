import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ShieldCheck, Sparkles, Wallet } from 'lucide-react-native'
import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '../src/components/Button'
import { Logo } from '../src/components/Logo'
import { useProxyAuth } from '../src/hooks/useProxyAuth'

import { ACCENT, CREAM, CREAM_45, CREAM_75 } from '@/common/theme/colors'

const features = [
  { Icon: ShieldCheck, text: 'Pagamento retido até a tarefa ser concluída' },
  { Icon: Wallet, text: 'Recebimento direto na carteira do Proxy' },
  { Icon: Sparkles, text: 'Avaliação e histórico transparentes' },
] as const

export default function Splash() {
  const { hydrated, isAuthenticated } = useProxyAuth()

  useEffect(() => {
    if (hydrated && isAuthenticated) {
      router.replace('/home')
    }
  }, [hydrated, isAuthenticated])

  // Render nothing while we wait for hydration or during the redirect.
  if (!hydrated || isAuthenticated) return null

  return (
    <LinearGradient
      colors={['hsl(220, 10%, 8%)', 'hsl(220, 12%, 14%)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 16 }}>
          {/* Top: Logo */}
          <View style={{ paddingTop: 12 }}>
            <Logo color={CREAM} />
          </View>

          {/* Hero — flows naturally below logo */}
          <View style={{ marginTop: 56 }}>
            {/* Minimal label */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Sparkles size={12} color={ACCENT} />
              <Text
                style={{
                  marginLeft: 6,
                  color: ACCENT,
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                Novo no Brasil
              </Text>
            </View>

            {/* Title */}
            <Text
              style={{
                marginTop: 18,
                fontSize: 40,
                fontWeight: '700',
                lineHeight: 44,
                color: CREAM,
                letterSpacing: -0.5,
              }}
            >
              Resolva o que precisa.{'\n'}
              <Text style={{ color: ACCENT }}>Ou ganhe fazendo.</Text>
            </Text>

            {/* Sub */}
            <Text
              style={{
                marginTop: 16,
                fontSize: 15,
                lineHeight: 22,
                color: CREAM_75,
              }}
            >
              Conectamos quem precisa de tarefas resolvidas a pessoas prontas
              pra executar — com pagamento seguro, no app.
            </Text>

            {/* Features */}
            <View style={{ marginTop: 32 }}>
              {features.map(({ Icon, text }, idx) => (
                <View
                  key={text}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: idx === 0 ? 0 : 14,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: 'hsla(40, 20%, 96%, 0.06)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <Icon size={16} color={ACCENT} />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 14,
                      lineHeight: 20,
                      color: CREAM_75,
                    }}
                  >
                    {text}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Spacer pushes CTAs to the bottom */}
          <View style={{ flex: 1 }} />

          {/* Bottom: CTAs */}
          <View>
            <Button
              variant="accent"
              size="xl"
              fullWidth
              onPress={() => router.push('/(auth)/choose-profile')}
            >
              Criar conta
            </Button>
            <View style={{ height: 10 }} />
            <Button
              variant="ghost"
              size="lg"
              fullWidth
              onPress={() => router.push('/(auth)/sign-in')}
            >
              Já tenho conta
            </Button>
            <Text
              style={{
                marginTop: 14,
                fontSize: 11,
                lineHeight: 16,
                color: CREAM_45,
                textAlign: 'center',
              }}
            >
              Ao continuar você aceita nossos Termos e Política de Privacidade.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  )
}
