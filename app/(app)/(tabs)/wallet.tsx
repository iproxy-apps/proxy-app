import * as WebBrowser from 'expo-web-browser'
import { StatusBar } from 'expo-status-bar'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { extractErrorMessage } from '@/apis/api-client'
import { useTransactionHistoryQuery } from '@/apis/wallet/wallet-hooks'
import { walletApis } from '@/apis/wallet/wallet-apis'
import { BG, GRAPHITE, MUTED } from '@/common/theme/colors'
import { useProxyAuth } from '@/feature/auth/hooks/useProxyAuth'
import { BalanceCard } from '@/feature/wallet/components/BalanceCard'
import { EarningsList } from '@/feature/wallet/components/EarningsList'
import { MerchantStatusRow } from '@/feature/wallet/components/MerchantStatusRow'
import { useStripeOnboarding } from '@/feature/wallet/hooks/useStripeOnboarding'
import { toast } from '@/lib/toast'
import { useState } from 'react'

export default function Wallet() {
  const { session } = useProxyAuth()
  const stripeReady = !!session?.stripeAccountReady
  const balance = session?.walletBalance ?? 0

  const onboarding = useStripeOnboarding()
  const [dashboardPending, setDashboardPending] = useState(false)

  const history = useTransactionHistoryQuery({ enabled: !!session })

  const openDashboard = async () => {
    if (dashboardPending) return
    setDashboardPending(true)
    try {
      const { dashboardUrl } = await walletApis.merchantDashboard()
      await WebBrowser.openBrowserAsync(dashboardUrl)
    } catch (e) {
      toast.error(extractErrorMessage(e))
    } finally {
      setDashboardPending(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingTop: 12, marginBottom: 24 }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '700',
              color: GRAPHITE,
              letterSpacing: -0.5,
              lineHeight: 34,
            }}
          >
            Carteira
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 14,
              color: MUTED,
              lineHeight: 20,
            }}
          >
            Seus ganhos como Proxy.
          </Text>
        </View>

        <BalanceCard amount={balance} />

        <View style={{ marginTop: 16 }}>
          <MerchantStatusRow
            ready={stripeReady}
            onboardingPending={onboarding.isPending}
            dashboardPending={dashboardPending}
            onStartOnboarding={onboarding.start}
            onOpenDashboard={openDashboard}
          />
        </View>

        <View style={{ marginTop: 28 }}>
          <EarningsList
            earnings={history.data?.tasksCompleted ?? []}
            loading={history.isLoading}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
