import { CreditCard } from 'lucide-react-native'
import { Text, View } from 'react-native'

import {
  ACCENT,
  ACCENT_TINT,
  BORDER,
  GRAPHITE,
  MUTED,
} from '@/common/theme/colors'

export function EmptyState() {
  return (
    <View
      style={{
        marginTop: 28,
        padding: 24,
        borderRadius: 20,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: BORDER,
        alignItems: 'flex-start',
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: ACCENT_TINT,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        <CreditCard size={22} color={ACCENT} />
      </View>
      <Text
        style={{
          fontSize: 17,
          fontWeight: '700',
          color: GRAPHITE,
          marginBottom: 6,
        }}
      >
        Nenhum cartão salvo
      </Text>
      <Text style={{ fontSize: 14, color: MUTED, lineHeight: 20 }}>
        Adicione um cartão pra contratar serviços rapidamente. Você só usa
        quando paga — guardamos com segurança via Stripe.
      </Text>
    </View>
  )
}
