import { MapPin } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'

import type { TTask } from '@/apis/tasks/tasks-api-types'
import {
  ACCENT_TINT_STRONG,
  BORDER,
  GRAPHITE,
  MUTED,
  SUBTLE,
} from '@/common/theme/colors'
import { formatBRL } from '@/common/utils/format'
import { formatDistance } from '@/common/utils/haversine'
import { statusLabel } from '../utils/status-display'

type Props = {
  task: TTask
  onPress: (task: TTask) => void
  /** Distance from the device to the task, in km. Hidden when undefined. */
  distanceKm?: number | null
}

export function TaskCard({ task, onPress, distanceKm }: Props) {
  const distanceText = distanceKm != null ? formatDistance(distanceKm) : null
  return (
    <Pressable
      onPress={() => onPress(task)}
      accessibilityRole="button"
      accessibilityLabel={`Abrir tarefa ${task.title}`}
    >
      {({ pressed }) => (
        <View
          style={{
            padding: 16,
            borderRadius: 16,
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: BORDER,
            opacity: pressed ? 0.85 : 1,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: ACCENT_TINT_STRONG,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: GRAPHITE,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                  }}
                >
                  {statusLabel(task.status)}
                </Text>
              </View>

              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: GRAPHITE,
                  letterSpacing: -0.2,
                  lineHeight: 20,
                }}
                numberOfLines={2}
              >
                {task.title}
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 6,
                }}
              >
                <MapPin size={12} color={SUBTLE} />
                <Text
                  style={{
                    marginLeft: 4,
                    fontSize: 12,
                    color: MUTED,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {task.locationAddress}
                </Text>
                {distanceText ? (
                  <Text
                    style={{
                      marginLeft: 6,
                      fontSize: 12,
                      color: MUTED,
                      fontWeight: '600',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    · {distanceText}
                  </Text>
                ) : null}
              </View>
            </View>

            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: GRAPHITE,
                letterSpacing: -0.2,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatBRL(task.offeredPrice)}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  )
}
