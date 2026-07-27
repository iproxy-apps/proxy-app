import { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'

import { BORDER, GRAPHITE_TINT, GRAPHITE_TINT_SOFT } from '@/common/theme/colors'

export function TaskCardSkeleton() {
  const opacity = useRef(new Animated.Value(0.55)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Animated.View
      style={{
        opacity,
        padding: 16,
        borderRadius: 16,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: BORDER,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <View
            style={{
              width: 90,
              height: 16,
              borderRadius: 999,
              backgroundColor: GRAPHITE_TINT,
              marginBottom: 10,
            }}
          />
          <View
            style={{
              width: '85%',
              height: 14,
              borderRadius: 4,
              backgroundColor: GRAPHITE_TINT,
              marginBottom: 8,
            }}
          />
          <View
            style={{
              width: '55%',
              height: 12,
              borderRadius: 4,
              backgroundColor: GRAPHITE_TINT_SOFT,
            }}
          />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View
            style={{
              width: 62,
              height: 14,
              borderRadius: 4,
              backgroundColor: GRAPHITE_TINT,
            }}
          />
          <View
            style={{
              marginTop: 10,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: GRAPHITE_TINT_SOFT,
            }}
          />
        </View>
      </View>
    </Animated.View>
  )
}
