import { Text, View } from 'react-native'

import { BORDER, GRAPHITE, MUTED } from '@/common/theme/colors'
import { formatBRL } from '@/common/utils/format'

const PLATFORM_FEE_RATE = 0.2
const STRIPE_FEE_RATE = 0.0399
const STRIPE_FEE_FIXED = 0.39

type Props = {
  offeredPrice: number
}

/**
 * Client-facing breakdown of what the customer will be charged. The backend
 * recomputes fees on its side at charge time — the numbers here are for
 * transparency only.
 */
export function PriceBreakdown({ offeredPrice }: Props) {
  const platformFee = offeredPrice * PLATFORM_FEE_RATE
  const stripeFee = offeredPrice * STRIPE_FEE_RATE + STRIPE_FEE_FIXED
  const total = offeredPrice + platformFee + stripeFee

  return (
    <View
      style={{
        padding: 16,
        borderRadius: 16,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: BORDER,
      }}
    >
      <Row label="Valor oferecido" value={formatBRL(offeredPrice)} />
      <Row
        label="Taxa da plataforma (20%)"
        value={formatBRL(platformFee)}
      />
      <Row label="Taxa Stripe (3,99% + R$ 0,39)" value={formatBRL(stripeFee)} />

      <View
        style={{
          height: 1,
          backgroundColor: BORDER,
          marginVertical: 12,
        }}
      />

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: '700',
            color: GRAPHITE,
            letterSpacing: -0.2,
          }}
        >
          Total a pagar
        </Text>
        <Text
          style={{
            fontSize: 17,
            fontWeight: '700',
            color: GRAPHITE,
            letterSpacing: -0.3,
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatBRL(total)}
        </Text>
      </View>
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}
    >
      <Text style={{ fontSize: 13, color: MUTED, flex: 1, marginRight: 12 }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: GRAPHITE,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  )
}
