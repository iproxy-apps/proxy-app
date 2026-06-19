import type { LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
  ACCENT,
  ACCENT_TINT,
  BG,
  BORDER,
  GRAPHITE,
  MUTED,
} from '@/common/theme/colors'

type Props = {
  Icon: LucideIcon
  title: string
  subtitle: string
  description: string
  footer?: ReactNode
}

export function TabPlaceholder({ Icon, title, subtitle, description, footer }: Props) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
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
          <Text
            style={{
              fontSize: 28,
              fontWeight: '700',
              color: GRAPHITE,
              letterSpacing: -0.5,
              lineHeight: 34,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 14,
              color: MUTED,
              lineHeight: 20,
            }}
          >
            {subtitle}
          </Text>
        </View>

        <View
          style={{
            marginTop: 28,
            padding: 20,
            borderRadius: 16,
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: BORDER,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: ACCENT_TINT,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Icon size={20} color={ACCENT} />
          </View>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: GRAPHITE,
              marginBottom: 4,
            }}
          >
            Em construção
          </Text>
          <Text style={{ fontSize: 13, color: MUTED, lineHeight: 19 }}>
            {description}
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        {footer ? <View style={{ marginTop: 24 }}>{footer}</View> : null}
      </ScrollView>
    </SafeAreaView>
  )
}
