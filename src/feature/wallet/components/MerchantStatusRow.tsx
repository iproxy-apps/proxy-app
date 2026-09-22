import { ExternalLink, ShieldCheck } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'

import {
  ACCENT,
  ACCENT_TINT_STRONG,
  BORDER,
  GRAPHITE,
  MUTED,
  SUCCESS,
  SUCCESS_TINT,
} from '@/common/theme/colors'
import { Button } from '@/shared/components/Button'

type Props = {
  ready: boolean
  onboardingPending: boolean
  dashboardPending: boolean
  onStartOnboarding: () => void
  onOpenDashboard: () => void
}

export function MerchantStatusRow({
  ready,
  onboardingPending,
  dashboardPending,
  onStartOnboarding,
  onOpenDashboard,
}: Props) {
  if (!ready) {
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
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: ACCENT_TINT_STRONG,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          <ShieldCheck size={22} color={ACCENT} />
        </View>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: GRAPHITE,
            marginBottom: 4,
          }}
        >
          Configure sua conta pra receber
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: MUTED,
            lineHeight: 19,
            marginBottom: 16,
          }}
        >
          Antes de aceitar tarefas, conclua o cadastro no Stripe pra que o
          pagamento caia direto na sua conta.
        </Text>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={onboardingPending}
          onPress={onStartOnboarding}
        >
          Configurar recebimento
        </Button>
      </View>
    )
  }

  return (
    <View
      style={{
        padding: 16,
        borderRadius: 20,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: BORDER,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: SUCCESS_TINT,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
        }}
      >
        <ShieldCheck size={20} color={SUCCESS} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: GRAPHITE }}>
          Conta merchant ativa
        </Text>
        <Pressable
          onPress={onOpenDashboard}
          disabled={dashboardPending}
          hitSlop={8}
          accessibilityRole="button"
        >
          {({ pressed }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 2,
                opacity: pressed || dashboardPending ? 0.6 : 1,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: MUTED }}>
                {dashboardPending ? 'Abrindo painel…' : 'Abrir painel Stripe'}
              </Text>
              {!dashboardPending ? (
                <ExternalLink
                  size={12}
                  color={MUTED}
                  style={{ marginLeft: 4 }}
                />
              ) : null}
            </View>
          )}
        </Pressable>
      </View>
    </View>
  )
}
