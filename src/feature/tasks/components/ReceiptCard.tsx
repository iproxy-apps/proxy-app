import { Text, View } from 'react-native'

import type { TTaskDetail } from '@/apis/tasks/tasks-api-types'
import { BORDER, GRAPHITE, MUTED, SUBTLE } from '@/common/theme/colors'
import { formatBRL, formatDateTime } from '@/common/utils/format'
import { formatPaymentIntentId } from '@/feature/tasks/utils/format-payment-id'

type Props = {
  task: TTaskDetail
  role: 'client' | 'proxy'
}

/**
 * Renders on completed tasks. CLIENT sees what they paid + how it split;
 * PROXY sees what they received. Both see the completion date and a
 * shortened Stripe PaymentIntent id for reference.
 */
export function ReceiptCard({ task, role }: Props) {
  const isProxy = role === 'proxy'
  const headline = isProxy ? task.proxyEarnings : task.offeredPrice
  const headlineLabel = isProxy ? 'Você recebeu' : 'Valor pago'
  const paidAt = task.payment?.updatedAt ?? null

  return (
    <View
      style={{
        padding: 20,
        borderRadius: 20,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: BORDER,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: MUTED,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        }}
      >
        {headlineLabel}
      </Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 26,
          fontWeight: '700',
          color: GRAPHITE,
          letterSpacing: -0.5,
          fontVariant: ['tabular-nums'],
        }}
      >
        {formatBRL(headline)}
      </Text>

      <View
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: BORDER,
          gap: 10,
        }}
      >
        {isProxy ? (
          <>
            <Line label="Preço da tarefa" value={formatBRL(task.offeredPrice)} />
            <Line
              label="Taxa Proxy"
              value={`− ${formatBRL(task.platformFee)}`}
            />
          </>
        ) : (
          <>
            <Line
              label="Taxa Proxy"
              value={formatBRL(task.platformFee)}
            />
            <Line
              label="Recebido pelo executor"
              value={formatBRL(task.proxyEarnings)}
            />
          </>
        )}
        {paidAt ? (
          <Line label="Concluída em" value={formatDateTime(paidAt)} />
        ) : null}
        <Line
          label="ID do pagamento"
          value={formatPaymentIntentId(task.payment?.paymentIntent)}
          mono
        />
      </View>

      <Text
        style={{
          marginTop: 14,
          fontSize: 11,
          color: SUBTLE,
          lineHeight: 15,
        }}
      >
        Guarde essas informações se precisar entrar em contato com o suporte
        sobre esta tarefa.
      </Text>
    </View>
  )
}

function Line({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Text style={{ fontSize: 13, color: MUTED }}>{label}</Text>
      <Text
        style={{
          fontSize: 13,
          color: GRAPHITE,
          fontWeight: '600',
          fontVariant: mono ? ['tabular-nums'] : undefined,
        }}
      >
        {value}
      </Text>
    </View>
  )
}
