import { Text, View } from 'react-native'

import {
  BORDER,
  GRAPHITE,
  MUTED,
  SUBTLE,
  SUCCESS,
} from '@/common/theme/colors'
import { formatBRL } from '@/common/utils/format'
import type { TCompletedTransactionTask } from '@/apis/wallet/wallet-api-types'

type Props = {
  earnings: TCompletedTransactionTask[]
  loading: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

export function EarningsList({ earnings, loading }: Props) {
  return (
    <View>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '700',
          color: MUTED,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        Ganhos recentes
      </Text>

      {loading ? (
        <View
          style={{
            padding: 20,
            borderRadius: 16,
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: BORDER,
          }}
        >
          <Text style={{ fontSize: 13, color: SUBTLE }}>Carregando…</Text>
        </View>
      ) : earnings.length === 0 ? (
        <View
          style={{
            padding: 20,
            borderRadius: 16,
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: BORDER,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: GRAPHITE,
              marginBottom: 4,
            }}
          >
            Sem ganhos ainda
          </Text>
          <Text style={{ fontSize: 13, color: MUTED, lineHeight: 19 }}>
            Quando você concluir uma tarefa validada, o valor líquido aparece
            aqui.
          </Text>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: BORDER,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {earnings.map((task, i) => (
            <View
              key={task.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: BORDER,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 14, fontWeight: '600', color: GRAPHITE }}
                >
                  {task.title}
                </Text>
                <Text
                  style={{
                    marginTop: 2,
                    fontSize: 12,
                    color: SUBTLE,
                  }}
                >
                  {formatDate(task.completedAt)}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: SUCCESS,
                  fontVariant: ['tabular-nums'],
                }}
              >
                +{formatBRL(task.netAmount)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
