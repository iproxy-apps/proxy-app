import { BadgeCheck, Star } from 'lucide-react-native'
import { Text, View } from 'react-native'

import type { TTaskCounterpart } from '@/apis/tasks/tasks-api-types'
import {
  ACCENT,
  BORDER,
  GRAPHITE,
  MUTED,
  SUBTLE,
} from '@/common/theme/colors'
import { Avatar } from '@/shared/components/Avatar'

type Props = {
  counterpart: TTaskCounterpart
  role: 'executor' | 'client'
}

export function CounterpartCard({ counterpart, role }: Props) {
  const roleLabel = role === 'executor' ? 'Executor da tarefa' : 'Cliente'
  const rating = Number(counterpart.rating)
  const showRating = Number.isFinite(rating) && rating > 0

  return (
    <View
      style={{
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
        <Avatar name={counterpart.name} size={48} variant="light" />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: MUTED,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          {roleLabel}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 4,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: GRAPHITE,
              letterSpacing: -0.2,
            }}
            numberOfLines={1}
          >
            {counterpart.name}
          </Text>
          {counterpart.isVerified ? (
            <View style={{ marginLeft: 6 }}>
              <BadgeCheck size={16} color={ACCENT} fill="white" />
            </View>
          ) : null}
        </View>

        {showRating ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 4,
            }}
          >
            <Star size={12} color={ACCENT} fill={ACCENT} />
            <Text
              style={{
                marginLeft: 4,
                fontSize: 12,
                color: MUTED,
                fontVariant: ['tabular-nums'],
              }}
            >
              {rating.toFixed(1).replace('.', ',')}
            </Text>
          </View>
        ) : (
          <Text
            style={{
              marginTop: 4,
              fontSize: 12,
              color: SUBTLE,
            }}
          >
            Sem avaliações ainda
          </Text>
        )}
      </View>
    </View>
  )
}
