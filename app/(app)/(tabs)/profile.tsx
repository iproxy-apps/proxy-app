import { router } from 'expo-router'
import { useEffect } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { BG, BORDER, GRAPHITE, SUBTLE } from '@/common/theme/colors'
import { useProxyAuth } from '@/feature/auth/hooks/useProxyAuth'
import { IdentityCard } from '@/feature/profile/components/IdentityCard'
import {
  MenuListDivider,
  MenuRow,
} from '@/feature/profile/components/MenuList'
import { modal } from '@/lib/modal'
import { Button } from '@/shared/components/Button'
import { useCardStore } from '@/store/card-store'

export default function Profile() {
  const { session, signOut } = useProxyAuth()
  const isClient = session?.userType === 'CLIENT'

  const card = useCardStore((s) => s.card)
  const cardLoading = useCardStore((s) => s.loading)
  const cardLoaded = useCardStore((s) => s.loaded)
  const loadCard = useCardStore((s) => s.load)

  // Triggers a fetch on first mount once the session is known to be a CLIENT.
  // The store guarantees it won't refire if already loaded / in-flight.
  useEffect(() => {
    if (isClient) loadCard()
  }, [isClient, loadCard])

  const handleSignOut = () => {
    modal.confirm({
      title: 'Sair da conta?',
      message: 'Você precisará entrar de novo na próxima vez.',
      okLabel: 'Sair',
      onOk: signOut,
    })
  }

  const openEditAccount = () =>
    modal.info(
      'Em breve você poderá editar seus dados, foto e gerenciar a conta por aqui.',
    )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            paddingTop: 12,
            fontSize: 28,
            fontWeight: '700',
            color: GRAPHITE,
            letterSpacing: -0.5,
            lineHeight: 34,
          }}
        >
          Perfil
        </Text>

        <IdentityCard session={session} />

        <Text
          style={{
            marginTop: 28,
            marginBottom: 10,
            paddingHorizontal: 4,
            fontSize: 11,
            fontWeight: '700',
            color: SUBTLE,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          Conta
        </Text>

        <View
          style={{
            backgroundColor: 'white',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: BORDER,
            overflow: 'hidden',
          }}
        >
          <MenuRow label="Editar dados" onPress={openEditAccount} />
          {isClient ? (
            <>
              <MenuListDivider />
              <MenuRow
                label="Cartão"
                hint={card ? `•••• ${card.last4}` : 'Adicionar'}
                loading={cardLoading || !cardLoaded}
                onPress={() => router.push('/cards')}
              />
            </>
          ) : null}
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ marginTop: 24 }}>
          <Button variant="outline" size="lg" fullWidth onPress={handleSignOut}>
            Sair da conta
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
