import { router } from 'expo-router'
import { ChevronRight } from 'lucide-react-native'
import { useEffect } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '../../../src/components/Button'
import { useProxyAuth } from '../../../src/hooks/useProxyAuth'
import { modal } from '../../../src/lib/modal'
import { useCardStore } from '../../../src/store/card-store'

import {
  ACCENT,
  ACCENT_BORDER,
  ACCENT_TINT_STRONG,
  BG,
  BORDER,
  GRAPHITE,
  MUTED,
  SUBTLE,
} from '@/common/theme/colors'

const initialsOf = (name?: string | null) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '?'
}

export default function Profile() {
  const { session, signOut } = useProxyAuth()
  const isClient = session?.userType === 'CLIENT'
  const roleLabel = isClient ? 'Cliente' : 'Proxy'

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

        {/* Identity card */}
        <View
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 16,
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: BORDER,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: GRAPHITE,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 14,
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: '700',
                color: 'white',
                letterSpacing: 0.5,
              }}
            >
              {initialsOf(session?.name)}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: GRAPHITE,
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              {session?.name ?? 'Sua conta'}
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontSize: 13,
                color: MUTED,
              }}
              numberOfLines={1}
            >
              {session?.email ?? ''}
            </Text>
          </View>

          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: ACCENT_TINT_STRONG,
              borderWidth: 1,
              borderColor: ACCENT_BORDER,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: ACCENT,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              {roleLabel}
            </Text>
          </View>
        </View>

        {/* Section label */}
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

        {/* Menu card */}
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
              <Divider />
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

// -----------------------------------------------------------------------------
// Menu primitives
// -----------------------------------------------------------------------------

function Divider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: BORDER,
        marginLeft: 18,
      }}
    />
  )
}

type MenuRowProps = {
  label: string
  hint?: string
  loading?: boolean
  onPress: () => void
}

function MenuRow({ label, hint, loading, onPress }: MenuRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <View style={menuStyles.row}>
        <Text style={menuStyles.label} numberOfLines={1}>
          {label}
        </Text>

        {loading ? (
          <ActivityIndicator
            size="small"
            color={MUTED}
            style={{ marginRight: 8 }}
          />
        ) : hint ? (
          <Text style={menuStyles.hint}>{hint}</Text>
        ) : null}

        <ChevronRight size={18} color={SUBTLE} />
      </View>
    </TouchableOpacity>
  )
}

const menuStyles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: GRAPHITE,
  },
  hint: {
    fontSize: 13,
    color: MUTED,
    marginRight: 8,
    fontVariant: ['tabular-nums'],
  },
})
