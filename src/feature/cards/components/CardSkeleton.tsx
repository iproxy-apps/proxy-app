import { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'

/**
 * Loading placeholder that mirrors the CardPreview footprint (same aspectRatio
 * and border-radius) so the layout doesn't shift when the real card mounts.
 */
export function CardSkeleton() {
  const pulse = useRef(new Animated.Value(0.55)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  return (
    <Animated.View style={{ marginTop: 28, opacity: pulse }}>
      <View
        style={{
          borderRadius: 20,
          aspectRatio: 1.78,
          backgroundColor: 'hsl(40, 12%, 90%)',
        }}
      />
    </Animated.View>
  )
}
