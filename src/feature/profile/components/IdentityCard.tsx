import { Text, View } from 'react-native'

import type { TSessionPayload } from '@/apis/auth/auth-api-types'
import {
  ACCENT,
  ACCENT_BORDER,
  ACCENT_TINT_STRONG,
  BORDER,
  GRAPHITE,
  MUTED,
} from '@/common/theme/colors'
import { Avatar } from '@/shared/components/Avatar'

type Props = {
  session: TSessionPayload | null
}

/**
 * Compact identity header — avatar with initials, name + email, and
 * a mustard role chip on the right (CLIENTE / PROXY).
 */
export function IdentityCard({ session }: Props) {
  const isClient = session?.userType === 'CLIENT'
  const roleLabel = isClient ? 'Cliente' : 'Proxy'

  return (
    <View
      style={{
        marginTop: 20,
        padding: 16,
        borderRadius: 16,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: BORDER,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View style={{ marginRight: 14 }}>
        <Avatar name={session?.name} size={52} variant="light" />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: GRAPHITE,
            letterSpacing: -0.2,
          }}
          numberOfLines={1}
        >
          {session?.name ?? 'Sua conta'}
        </Text>
        <Text
          style={{
            marginTop: 2,
            fontSize: 13,
            color: MUTED,
          }}
          numberOfLines={1}
        >
          {session?.email ?? ''}
        </Text>
      </View>

      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 999,
          backgroundColor: ACCENT_TINT_STRONG,
          borderWidth: 1,
          borderColor: ACCENT_BORDER,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: ACCENT,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          {roleLabel}
        </Text>
      </View>
    </View>
  )
}
