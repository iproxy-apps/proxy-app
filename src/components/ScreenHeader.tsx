import { router } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

type Props = {
  title?: string
  back?: boolean
  /** Custom back handler. Falls back to `router.back()` if not provided. */
  onBack?: () => void
  right?: ReactNode
}

export function ScreenHeader({ title, back = true, onBack, right }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 8,
        minHeight: 48,
      }}
    >
      <View style={{ width: 40, alignItems: 'flex-start' }}>
        {back ? (
          <Pressable
            onPress={() => (onBack ? onBack() : router.back())}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <ArrowLeft size={22} color="hsl(220, 10%, 12%)" />
          </Pressable>
        ) : null}
      </View>

      {title ? (
        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 15,
            fontWeight: '600',
            color: 'hsl(220, 10%, 12%)',
          }}
        >
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      <View style={{ width: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  )
}
