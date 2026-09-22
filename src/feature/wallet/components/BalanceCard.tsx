import { Text, View } from 'react-native'

import { CREAM, CREAM_45, GRAPHITE } from '@/common/theme/colors'
import { formatBRL } from '@/common/utils/format'

type Props = {
  amount: number
}

export function BalanceCard({ amount }: Props) {
  return (
    <View
      style={{
        backgroundColor: GRAPHITE,
        borderRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 28,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: CREAM_45,
          letterSpacing: 0.9,
          textTransform: 'uppercase',
        }}
      >
        Saldo disponível
      </Text>
      <Text
        style={{
          marginTop: 8,
          fontSize: 40,
          fontWeight: '700',
          color: CREAM,
          letterSpacing: -1,
          fontVariant: ['tabular-nums'],
        }}
      >
        {formatBRL(amount)}
      </Text>
    </View>
  )
}
