import { CardField, useStripe } from '@stripe/stripe-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CreditCard, X } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '../../src/components/Button'
import { ScreenHeader } from '../../src/components/ScreenHeader'
import { extractErrorMessage } from '../../src/lib/api/client'
import { apis } from '../../src/lib/api/routes'
import { modal } from '../../src/lib/modal'
import { useCardStore } from '../../src/store/card-store'
import type { Card } from '../../src/types/card'

const GRAPHITE = 'hsl(220, 10%, 12%)'
const MUTED = 'hsl(220, 8%, 42%)'
const ACCENT = 'hsl(45, 95%, 55%)'
const ACCENT_TINT = 'hsla(45, 95%, 55%, 0.15)'
const BORDER = 'hsl(40, 10%, 88%)'
const CREAM = 'hsl(40, 20%, 96%)'
const CREAM_75 = 'hsla(40, 20%, 96%, 0.75)'
const CREAM_45 = 'hsla(40, 20%, 96%, 0.45)'
const BG = 'hsl(40, 20%, 97%)'

const brandDisplay = (brand: string) => {
  const map: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    diners: 'Diners',
    jcb: 'JCB',
    unionpay: 'UnionPay',
    elo: 'Elo',
    hipercard: 'Hipercard',
  }
  return map[brand.toLowerCase()] ?? 'Cartão'
}

export default function Cards() {
  const card = useCardStore((s) => s.card)
  const loading = useCardStore((s) => s.loading)
  const loaded = useCardStore((s) => s.loaded)
  const loadCard = useCardStore((s) => s.load)
  const reloadCard = useCardStore((s) => s.reload)
  const setCardInStore = useCardStore((s) => s.setCard)

  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    loadCard()
  }, [loadCard])

  // Treat as loading until the first fetch has resolved (or 404'd).
  const showLoading = loading || !loaded

  const openAdd = () => {
    if (card) {
      modal.confirm({
        title: 'Substituir cartão?',
        message:
          'O cartão atual será removido e o novo cartão ficará no lugar.',
        okLabel: 'Substituir',
        // Wait for the confirm modal to finish dismissing before sliding the
        // sheet in — otherwise both animations run on top of each other.
        onOk: () => {
          setTimeout(() => setSheetOpen(true), 340)
        },
      })
    } else {
      setSheetOpen(true)
    }
  }

  const handleRemove = () => {
    if (!card) return
    modal.confirm({
      title: 'Remover cartão?',
      message: 'Você não conseguirá contratar serviços até adicionar outro.',
      okLabel: 'Remover',
      destructive: true,
      onOk: async () => {
        try {
          await apis.cards.delete(card.id)
          setCardInStore(null)
        } catch (e) {
          // Defer the error modal until after the confirm modal has closed
          // to avoid the iOS "already presenting" stacking bug.
          setTimeout(() => modal.error(extractErrorMessage(e)), 280)
        }
      },
    })
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <ScreenHeader title="Cartão" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingTop: 4 }}>
          <Text
            style={{
              fontSize: 26,
              fontWeight: '700',
              color: GRAPHITE,
              letterSpacing: -0.5,
              lineHeight: 32,
            }}
          >
            Seu cartão
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 14,
              color: MUTED,
              lineHeight: 20,
            }}
          >
            Usado pra contratar serviços no app.
          </Text>
        </View>

        {showLoading ? (
          <CardSkeleton />
        ) : card ? (
          <CardPreview card={card} />
        ) : (
          <EmptyState />
        )}

        <View style={{ flex: 1 }} />

        {!showLoading ? (
          <View style={{ marginTop: 24, gap: 10 }}>
            <Button variant="primary" size="xl" fullWidth onPress={openAdd}>
              {card ? 'Substituir cartão' : 'Adicionar cartão'}
            </Button>

            {card ? (
              <Button
                variant="outline"
                size="lg"
                fullWidth
                onPress={handleRemove}
              >
                Remover cartão
              </Button>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <AddCardSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSuccess={() => {
          setSheetOpen(false)
          reloadCard()
        }}
      />
    </SafeAreaView>
  )
}

// -----------------------------------------------------------------------------
// Card preview (gradient card with masked digits + brand)
// -----------------------------------------------------------------------------

function CardPreview({ card }: { card: Card }) {
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
              backgroundColor: 'hsla(45, 95%, 55%, 0.18)',
              borderWidth: 1,
              borderColor: 'hsla(45, 95%, 55%, 0.45)',
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

// -----------------------------------------------------------------------------
// Loading skeleton — same footprint as CardPreview so the layout doesn't shift.
// -----------------------------------------------------------------------------

function CardSkeleton() {
  const pulse = useRef(new Animated.Value(0.55)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  return (
    <Animated.View style={{ marginTop: 28, opacity: pulse }}>
      <View
        style={{
          borderRadius: 20,
          aspectRatio: 1.78,
          backgroundColor: 'hsl(40, 12%, 90%)',
        }}
      />
    </Animated.View>
  )
}

// -----------------------------------------------------------------------------
// Empty state
// -----------------------------------------------------------------------------

function EmptyState() {
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

// -----------------------------------------------------------------------------
// Add card bottom sheet (CardField + tokenize + POST)
// -----------------------------------------------------------------------------

type AddCardSheetProps = {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
}

const SCREEN_HEIGHT = Dimensions.get('window').height

function AddCardSheet({ visible, onClose, onSuccess }: AddCardSheetProps) {
  const { createPaymentMethod } = useStripe()
  const [complete, setComplete] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [mounted, setMounted] = useState(visible)
  const [cardFieldKey, setCardFieldKey] = useState(0)
  const [sheetError, setSheetError] = useState<string | null>(null)

  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current

  useEffect(() => {
    if (visible) {
      setMounted(true)
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 260,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false)
          // Reset local state so the next open is a fresh form.
          setComplete(false)
          setSheetError(null)
          setCardFieldKey((k) => k + 1)
        }
      })
    }
  }, [visible, opacity, translateY])

  const handleSave = async () => {
    if (!complete || submitting) return
    setSheetError(null)
    setSubmitting(true)
    try {
      const { paymentMethod, error } = await createPaymentMethod({
        paymentMethodType: 'Card',
      })
      if (error || !paymentMethod) {
        setSheetError(error?.message ?? 'Cartão inválido. Confira os dados.')
        return
      }
      await apis.cards.create({ token: paymentMethod.id })
      onSuccess()
    } catch (e) {
      setSheetError(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  if (!mounted) return null

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'black',
          opacity,
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
        }}
        pointerEvents="box-none"
      >
        <Animated.View
          style={{
            backgroundColor: BG,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 36,
            transform: [{ translateY }],
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: '700',
                color: GRAPHITE,
                letterSpacing: -0.3,
              }}
            >
              Adicionar cartão
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <X size={20} color={GRAPHITE} />
            </Pressable>
          </View>

          <Text
            style={{
              fontSize: 13,
              color: MUTED,
              lineHeight: 19,
              marginBottom: 22,
            }}
          >
            Cobramos só quando você contrata uma tarefa. Pagamento retido até a
            conclusão.
          </Text>

          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: GRAPHITE,
              marginBottom: 6,
            }}
          >
            Dados do cartão
          </Text>

          <View
            style={{
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 12,
              backgroundColor: 'white',
              overflow: 'hidden',
              marginBottom: 8,
            }}
          >
            <CardField
              key={cardFieldKey}
              postalCodeEnabled={false}
              placeholders={{ number: '0000 0000 0000 0000' }}
              cardStyle={{
                backgroundColor: '#FFFFFF',
                textColor: '#1F2433',
                placeholderColor: '#94A3B8',
                cursorColor: '#1F2433',
                fontSize: 16,
                borderWidth: 0,
                borderColor: '#FFFFFF',
              }}
              style={{
                width: '100%',
                height: 50,
                backgroundColor: '#FFFFFF',
              }}
              onCardChange={(d) => {
                setComplete(d.complete)
                if (sheetError) setSheetError(null)
              }}
            />
          </View>

          {sheetError ? (
            <Text
              style={{
                fontSize: 13,
                color: 'hsl(358, 70%, 52%)',
                lineHeight: 18,
                marginBottom: 16,
                fontWeight: '500',
              }}
            >
              {sheetError}
            </Text>
          ) : (
            <Text
              style={{
                fontSize: 12,
                color: MUTED,
                lineHeight: 18,
                marginBottom: 22,
              }}
            >
              Use os dados do seu cartão de crédito.
            </Text>
          )}

          <Button
            variant="primary"
            size="xl"
            fullWidth
            loading={submitting}
            disabled={!complete}
            onPress={handleSave}
          >
            Salvar cartão
          </Button>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
