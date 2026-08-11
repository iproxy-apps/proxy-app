import { Star } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { ACCENT, SUBTLE } from '@/common/theme/colors'

type Props = {
  value: number
  onChange: (value: number) => void
  size?: number
  /** How many stars to render (default 5). */
  count?: number
}

/**
 * Tappable star rating (default 5). `value` is 0..count; 0 means unrated.
 * Tapping the current star clears back to 0 so users can undo a wrong tap.
 */
export function RatingInput({ value, onChange, size = 32, count = 5 }: Props) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {Array.from({ length: count }, (_, i) => {
        const starValue = i + 1
        const filled = starValue <= value
        return (
          <Pressable
            key={starValue}
            onPress={() => onChange(starValue === value ? 0 : starValue)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Nota ${starValue}`}
            accessibilityState={{ selected: filled }}
          >
            {({ pressed }) => (
              <View style={{ opacity: pressed ? 0.7 : 1 }}>
                <Star
                  size={size}
                  color={filled ? ACCENT : SUBTLE}
                  fill={filled ? ACCENT : 'transparent'}
                  strokeWidth={1.8}
                />
              </View>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}
