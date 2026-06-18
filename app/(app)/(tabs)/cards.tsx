import { CardField, useStripe } from '@stripe/stripe-react-native'
import { isAxiosError } from 'axios'
import { LinearGradient } from 'expo-linear-gradient'
import { CreditCard, X } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '../../../src/components/Button'
import { extractErrorMessage } from '../../../src/lib/api/client'
import { apis } from '../../../src/lib/api/routes'
import { modal } from '../../../src/lib/modal'
import type { Card } from '../../../src/types/card'

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
  const [card, setCard] = useState<Card | null>(null)
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [removing, setRemoving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apis.cards.fetch()
      setCard(data)
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 404) {
        setCard(null)
      } else {
        modal.error(extractErrorMessage(e))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openAdd = () => {
    if (card) {
      modal.confirm({
        title: 'Substituir cartão?',
        message:
          'O cartão atual será removido e o novo cartão ficará no lugar.',
        okLabel: 'Substituir',
        onOk: () => setSheetOpen(true),
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
        setRemoving(true)
        try {
          await apis.cards.delete(card.id)
          setCard(null)
          modal.success('Cartão removido.')
        } catch (e) {
          modal.error(extractErrorMessage(e))
        } finally {
          setRemoving(false)
        }
      },
    })
  }

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
        <View style={{ paddingTop: 12 }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '700',
              color: GRAPHITE,
              letterSpacing: -0.5,
              lineHeight: 34,
            }}
          >
            Cartões
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 14,
              color: MUTED,
              lineHeight: 20,
            }}
          >
            Seu cartão pra contratar serviços.
          </Text>
        </View>

        {loading ? (
          <View style={{ marginTop: 60, alignItems: 'center' }}>
            <ActivityIndicator color={GRAPHITE} />
          </View>
        ) : card ? (
          <CardPreview card={card} />
        ) : (
          <EmptyState />
        )}

        <View style={{ flex: 1 }} />

        {!loading ? (
          <View style={{ marginTop: 24, gap: 10 }}>
            <Button variant="primary" size="xl" fullWidth onPress={openAdd}>
              {card ? 'Substituir cartão' : 'Adicionar cartão'}
            </Button>

            {card ? (
              <Button
                variant="outline"
                size="lg"
                fullWidth
                loading={removing}
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
        onSaved={(saved) => {
          setCard(saved)
          setSheetOpen(false)
          modal.success('Cartão adicionado!')
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
          padding: 22,
          aspectRatio: 1.6,
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
  onSaved: (card: Card) => void
}

function AddCardSheet({ visible, onClose, onSaved }: AddCardSheetProps) {
  const { createPaymentMethod } = useStripe()
  const [complete, setComplete] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSave = async () => {
    if (!complete) return
    setSubmitting(true)
    try {
      const { paymentMethod, error } = await createPaymentMethod({
        paymentMethodType: 'Card',
      })
      if (error || !paymentMethod) {
        modal.error(error?.message ?? 'Cartão inválido. Confira os dados.')
        return
      }
      const saved = await apis.cards.create({ token: paymentMethod.id })
      onSaved(saved)
    } catch (e) {
      modal.error(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <View
          style={{
            backgroundColor: BG,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: 36,
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
              marginBottom: 20,
            }}
          >
            Cobramos só quando você contrata uma tarefa. Pagamento retido até a
            conclusão.
          </Text>

          <CardField
            postalCodeEnabled={false}
            placeholders={{ number: '0000 0000 0000 0000' }}
            cardStyle={{
              backgroundColor: 'white',
              borderColor: BORDER,
              borderWidth: 1,
              borderRadius: 12,
              fontSize: 15,
              textColor: GRAPHITE,
              placeholderColor: 'hsl(220, 8%, 60%)',
            }}
            style={{ width: '100%', height: 52, marginBottom: 20 }}
            onCardChange={(d) => setComplete(d.complete)}
          />

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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
