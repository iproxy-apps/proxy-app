import { Text, View } from 'react-native'

import { CREAM, GRAPHITE } from '@/common/theme/colors'
import { initialsOf } from '@/common/utils/initials'

type Props = {
  name?: string | null
  size?: number
  /** `light` = graphite bg + white text. `dark` = translucent bg + cream text. */
  variant?: 'light' | 'dark'
}

/**
 * Circular avatar showing the user's initials. Two variants: `light` for use
 * on white/cream surfaces (Profile), `dark` for use on graphite hero
 * backgrounds (Home hero). Image support (session.avatarUrl) is a future
 * addition — kept out for now to avoid the loading/error state noise.
 */
export function Avatar({ name, size = 48, variant = 'light' }: Props) {
  const isDark = variant === 'dark'
  const fontSize = Math.round(size / 3)

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : GRAPHITE,
        borderWidth: isDark ? 1 : 0,
        borderColor: 'rgba(255,255,255,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize,
          fontWeight: '700',
          color: isDark ? CREAM : 'white',
          letterSpacing: 0.5,
        }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  )
}
