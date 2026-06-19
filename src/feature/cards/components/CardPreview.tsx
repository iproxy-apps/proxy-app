import { LinearGradient } from 'expo-linear-gradient'
import { Text, View } from 'react-native'

import type { TCard } from '@/apis/cards/cards-api-types'
import {
  ACCENT,
  ACCENT_BORDER_STRONG,
  ACCENT_TINT_STRONG,
  CREAM,
  CREAM_45,
  CREAM_75,
} from '@/common/theme/colors'
import { brandDisplay } from '../utils/brand-display'

type Props = {
  card: TCard
}

export function CardPreview({ card }: Props) {
  return (
    <View style={{ marginTop: 28 }}>
      <LinearGradient
        colors={['hsl(220, 12%, 18%)', 'hsl(220, 10%, 8%)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20,
          paddingVertical: 18,
          paddingHorizontal: 20,
          aspectRatio: 1.78,
          justifyContent: 'space-between',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.4,
              color: ACCENT,
              textTransform: 'uppercase',
            }}
          >
            Proxy
          </Text>

          <View
            style={{
              width: 34,
              height: 24,
              borderRadius: 6,
              backgroundColor: ACCENT_TINT_STRONG,
              borderWidth: 1,
              borderColor: ACCENT_BORDER_STRONG,
            }}
          />
        </View>

        <View>
          <Text
            style={{
              fontSize: 11,
              color: CREAM_45,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Número
          </Text>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '600',
              color: CREAM,
              letterSpacing: 4,
              fontVariant: ['tabular-nums'],
            }}
          >
            •••• •••• •••• {card.last4}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 10,
                color: CREAM_45,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              Bandeira
            </Text>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: CREAM,
                letterSpacing: 0.2,
              }}
            >
              {brandDisplay(card.brand)}
            </Text>
          </View>

          <Text
            style={{
              fontSize: 11,
              color: CREAM_75,
              letterSpacing: 0.4,
            }}
          >
            Pagamento retido
          </Text>
        </View>
      </LinearGradient>
    </View>
  )
}
