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
  TextInput,
  View,
} from 'react-native'

import { extractErrorMessage } from '@/apis/api-client'
import { useValidateTaskMutation } from '@/apis/tasks/tasks-hooks'
import {
  BG,
  BORDER,
  DESTRUCTIVE,
  GRAPHITE,
  MUTED,
  SUBTLE,
} from '@/common/theme/colors'
import { Button } from '@/shared/components/Button'
import { RatingInput } from '@/shared/components/form/RatingInput'

const SCREEN_HEIGHT = Dimensions.get('window').height

type Props = {
  taskId: string
  visible: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ValidateTaskSheet({
  taskId,
  visible,
  onClose,
  onSuccess,
}: Props) {
  const validate = useValidateTaskMutation()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [mounted, setMounted] = useState(visible)
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
          setRating(0)
          setComment('')
          setSheetError(null)
        }
      })
    }
  }, [visible, opacity, translateY])

  const handleValidate = async () => {
    if (validate.isPending || rating <= 0) return
    setSheetError(null)
    try {
      await validate.mutateAsync({
        taskId,
        rating,
        comment: comment.trim() ? comment.trim() : undefined,
      })
      onSuccess()
    } catch (e) {
      setSheetError(extractErrorMessage(e))
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
              Como foi o serviço?
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
            Ao confirmar, liberamos o pagamento para o Proxy. Deixe uma nota
            pra ajudar a comunidade.
          </Text>

          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: GRAPHITE,
              marginBottom: 10,
              textAlign: 'center',
            }}
          >
            Sua avaliação
          </Text>
          <View style={{ alignItems: 'center', marginBottom: 22 }}>
            <RatingInput value={rating} onChange={setRating} size={36} />
          </View>

          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: GRAPHITE,
              marginBottom: 6,
            }}
          >
            Comentário
          </Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Conte como foi o serviço (opcional)."
            placeholderTextColor={SUBTLE}
            multiline
            numberOfLines={3}
            style={{
              minHeight: 84,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 12,
              backgroundColor: 'white',
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 12,
              fontSize: 15,
              color: GRAPHITE,
              textAlignVertical: 'top',
            }}
          />

          {sheetError ? (
            <Text
              style={{
                marginTop: 12,
                fontSize: 13,
                color: DESTRUCTIVE,
                lineHeight: 18,
                fontWeight: '500',
              }}
            >
              {sheetError}
            </Text>
          ) : null}

          <View style={{ marginTop: 22 }}>
            <Button
              variant="primary"
              size="xl"
              fullWidth
              disabled={rating <= 0}
              loading={validate.isPending}
              onPress={handleValidate}
            >
              Validar e pagar
            </Button>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
