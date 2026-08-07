import { useSegments } from 'expo-router'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react-native'
import { useEffect, useRef } from 'react'
import { Animated, Platform, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  CREAM,
  DESTRUCTIVE,
  GRAPHITE,
  INFO,
  SUCCESS,
} from '@/common/theme/colors'
import { useToastStore, type ToastVariant } from '@/store/toast-store'

const TOAST_DURATION_MS = 3500
const ENTER_DURATION_MS = 240
const EXIT_DURATION_MS = 220

// Mirrors the tabBarStyle.height in app/(app)/(tabs)/_layout.tsx.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 84 : 64

type VariantConfig = {
  Icon: typeof CheckCircle2
  color: string
}

const variants: Record<ToastVariant, VariantConfig> = {
  success: { Icon: CheckCircle2, color: SUCCESS },
  info: { Icon: Info, color: INFO },
  error: { Icon: AlertCircle, color: DESTRUCTIVE },
}

export function Toast() {
  const open = useToastStore((s) => s.open)
  const variant = useToastStore((s) => s.variant)
  const message = useToastStore((s) => s.message)
  const showId = useToastStore((s) => s.showId)
  const hide = useToastStore((s) => s.hide)

  const insets = useSafeAreaInsets()
  const segments = useSegments()
  const inTabs = (segments as string[]).includes('(tabs)')

  const translateY = useRef(new Animated.Value(120)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!open) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 120,
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
        speed: 14,
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

  // Position above the tab bar when inside the tabs stack; otherwise just above
  // the home indicator / bottom edge.
  const bottomOffset = inTabs
    ? TAB_BAR_HEIGHT + insets.bottom + 8
    : insets.bottom + 12

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: bottomOffset,
        zIndex: 9999,
      }}
    >
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={{
          marginHorizontal: 16,
          transform: [{ translateY }],
          opacity,
          backgroundColor: GRAPHITE,
          borderRadius: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 16,
          elevation: 8,
        }}
      >
        <Pressable
          onPress={hide}
          accessibilityRole="button"
          accessibilityLabel={message}
          android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
          style={{
            paddingVertical: 14,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 16,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: cfg.color,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Icon size={18} color={CREAM} strokeWidth={2.4} />
          </View>
          <Text
            style={{
              flex: 1,
              fontSize: 15,
              fontWeight: '600',
              color: CREAM,
              lineHeight: 20,
              letterSpacing: -0.1,
            }}
            numberOfLines={2}
          >
            {message}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

