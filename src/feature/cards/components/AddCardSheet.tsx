import { CardField, useStripe } from '@stripe/stripe-react-native'
import { X } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { extractErrorMessage } from '@/apis/api-client'
import { apis } from '@/apis/apis'
import {
  BG,
  BORDER,
  DESTRUCTIVE,
  GRAPHITE,
  MUTED,
} from '@/common/theme/colors'
import { Button } from '@/shared/components/Button'

const SCREEN_HEIGHT = Dimensions.get('window').height

type Props = {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AddCardSheet({ visible, onClose, onSuccess }: Props) {
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
                color: DESTRUCTIVE,
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
