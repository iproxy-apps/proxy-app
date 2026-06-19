import { AlertCircle, CheckCircle2, Info } from 'lucide-react-native'
import { useEffect, useRef } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import {
  BORDER,
  DESTRUCTIVE,
  DESTRUCTIVE_TINT,
  GRAPHITE,
  INFO,
  INFO_TINT,
  SUCCESS,
  SUCCESS_TINT,
} from '@/common/theme/colors'
import { useToastStore, type ToastVariant } from '../store/toast-store'

const TOAST_DURATION_MS = 2800
const ENTER_DURATION_MS = 220
const EXIT_DURATION_MS = 200

type VariantConfig = {
  Icon: typeof CheckCircle2
  color: string
  tint: string
}

const variants: Record<ToastVariant, VariantConfig> = {
  success: {
    Icon: CheckCircle2,
    color: SUCCESS,
    tint: SUCCESS_TINT,
  },
  info: {
    Icon: Info,
    color: INFO,
    tint: INFO_TINT,
  },
  error: {
    Icon: AlertCircle,
    color: DESTRUCTIVE,
    tint: DESTRUCTIVE_TINT,
  },
}

export function Toast() {
  const open = useToastStore((s) => s.open)
  const variant = useToastStore((s) => s.variant)
  const message = useToastStore((s) => s.message)
  const showId = useToastStore((s) => s.showId)
  const hide = useToastStore((s) => s.hide)

  const translateY = useRef(new Animated.Value(-120)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!open) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: EXIT_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: EXIT_DURATION_MS,
          useNativeDriver: true,
        }),
      ]).start()
      return
    }

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
        speed: 16,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: ENTER_DURATION_MS,
        useNativeDriver: true,
      }),
    ]).start()

    const timer = setTimeout(hide, TOAST_DURATION_MS)
    return () => clearTimeout(timer)
    // showId is included so re-triggering the same message restarts the timer.
  }, [open, showId, hide, translateY, opacity])

  const cfg = variants[variant]
  const { Icon } = cfg

  return (
    <SafeAreaView
      pointerEvents="box-none"
      edges={['top']}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
      }}
    >
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={{
          marginHorizontal: 16,
          marginTop: 4,
          transform: [{ translateY }],
          opacity,
        }}
      >
        <Pressable
          onPress={hide}
          accessibilityRole="button"
          style={({ pressed }) => ({
            backgroundColor: 'white',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: BORDER,
            paddingVertical: 12,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 4,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              backgroundColor: cfg.tint,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Icon size={16} color={cfg.color} />
          </View>
          <Text
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: '600',
              color: GRAPHITE,
              lineHeight: 19,
            }}
            numberOfLines={2}
          >
            {message}
          </Text>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  )
}
