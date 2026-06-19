import { router } from 'expo-router'
import { Briefcase, Check, ShoppingBag } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '../../src/components/Button'
import { ScreenHeader } from '../../src/components/ScreenHeader'
import {
  BORDER,
  CREAM,
  GRAPHITE,
  GRAPHITE_TINT_SOFT,
  MUTED,
} from '@/common/theme/colors'

type UserType = 'CLIENT' | 'PROXY'

const options = [
  {
    type: 'CLIENT' as const,
    Icon: ShoppingBag,
    title: 'Quero contratar serviços',
    description:
      'Publique tarefas e encontre alguém pra resolver pra você.',
  },
  {
    type: 'PROXY' as const,
    Icon: Briefcase,
    title: 'Quero executar tarefas',
    description:
      'Aceite tarefas na sua cidade e ganhe extra com flexibilidade.',
  },
]

export default function ChooseProfile() {
  const [selected, setSelected] = useState<UserType | null>(null)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'hsl(40, 20%, 97%)' }}>
      <ScreenHeader />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginTop: 16 }}>
          <Text
            style={{
              fontSize: 32,
              fontWeight: '700',
              color: GRAPHITE,
              letterSpacing: -0.5,
              lineHeight: 38,
            }}
          >
            Como você quer começar?
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 14,
              color: MUTED,
              lineHeight: 20,
            }}
          >
            Você pode trocar de perfil depois, dentro do app.
          </Text>
        </View>

        <View style={{ marginTop: 32, gap: 12 }}>
          {options.map(({ type, Icon, title, description }) => {
            const isSelected = selected === type
            return (
              <Pressable
                key={type}
                onPress={() => setSelected(type)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => ({
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? GRAPHITE : BORDER,
                  backgroundColor: isSelected
                    ? GRAPHITE_TINT_SOFT
                    : 'white',
                  borderRadius: 16,
                  padding: 18,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: isSelected
                        ? GRAPHITE
                        : 'hsl(40, 15%, 94%)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon
                      size={20}
                      color={isSelected ? CREAM : GRAPHITE}
                    />
                  </View>

                  <View style={{ flex: 1, paddingTop: 2 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: GRAPHITE,
                        lineHeight: 22,
                      }}
                    >
                      {title}
                    </Text>
                    <Text
                      style={{
                        marginTop: 4,
                        fontSize: 13,
                        color: MUTED,
                        lineHeight: 18,
                      }}
                    >
                      {description}
                    </Text>
                  </View>

                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: isSelected ? 0 : 1.5,
                      borderColor: BORDER,
                      backgroundColor: isSelected
                        ? 'hsl(45, 95%, 55%)'
                        : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                    }}
                  >
                    {isSelected ? <Check size={14} color={GRAPHITE} strokeWidth={3} /> : null}
                  </View>
                </View>
              </Pressable>
            )
          })}
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ marginTop: 24 }}>
          <Button
            variant="primary"
            size="xl"
            fullWidth
            disabled={!selected}
            onPress={() => {
              if (!selected) return
              router.push({
                pathname: '/(auth)/sign-up',
                params: { userType: selected },
              })
            }}
          >
            Continuar
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
