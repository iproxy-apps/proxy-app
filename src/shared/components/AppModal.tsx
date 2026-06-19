import { AlertCircle, CheckCircle2, Info } from 'lucide-react-native'
import { useState } from 'react'
import { Modal as RNModal, Pressable, Text, View } from 'react-native'

import {
  DESTRUCTIVE,
  DESTRUCTIVE_TINT,
  GRAPHITE,
  INFO,
  INFO_TINT,
  MUTED,
  SUCCESS,
  SUCCESS_TINT,
} from '@/common/theme/colors'
import { useModalStore, type ModalVariant } from '@/store/modal-store'
import { Button } from './Button'

type VariantConfig = {
  Icon: typeof AlertCircle
  color: string
  tint: string
  defaultTitle: string
}

const variants: Record<ModalVariant, VariantConfig> = {
  error: {
    Icon: AlertCircle,
    color: DESTRUCTIVE,
    tint: DESTRUCTIVE_TINT,
    defaultTitle: 'Algo deu errado',
  },
  success: {
    Icon: CheckCircle2,
    color: SUCCESS,
    tint: SUCCESS_TINT,
    defaultTitle: 'Tudo certo!',
  },
  info: {
    Icon: Info,
    color: INFO,
    tint: INFO_TINT,
    defaultTitle: 'Informação',
  },
}

export function AppModal() {
  const open = useModalStore((s) => s.open)
  const variant = useModalStore((s) => s.variant)
  const title = useModalStore((s) => s.title)
  const message = useModalStore((s) => s.message)
  const okLabel = useModalStore((s) => s.okLabel)
  const onOk = useModalStore((s) => s.onOk)
  const cancelLabel = useModalStore((s) => s.cancelLabel)
  const onCancel = useModalStore((s) => s.onCancel)
  const destructive = useModalStore((s) => s.destructive)
  const hide = useModalStore((s) => s.hide)

  const cfg = variants[variant]
  const { Icon } = cfg

  const [okLoading, setOkLoading] = useState(false)

  const handleOk = async () => {
    if (!onOk) {
      hide()
      return
    }
    try {
      const result = onOk()
      if (result instanceof Promise) {
        setOkLoading(true)
        await result
      }
    } finally {
      setOkLoading(false)
      hide()
    }
  }

  const handleCancel = () => {
    if (okLoading) return
    onCancel?.()
    hide()
  }

  const hasCancel = !!cancelLabel

  return (
    <RNModal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={hide}
    >
      <Pressable
        onPress={hide}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <Pressable
          // Intercepts taps inside the content so they don't dismiss the modal.
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: 'white',
            borderRadius: 20,
            padding: 24,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: cfg.tint,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Icon size={28} color={cfg.color} />
          </View>

          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: GRAPHITE,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            {title ?? cfg.defaultTitle}
          </Text>

          <Text
            style={{
              fontSize: 14,
              color: MUTED,
              textAlign: 'center',
              lineHeight: 20,
              marginBottom: 24,
            }}
          >
            {message}
          </Text>

          {hasCancel ? (
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <View style={{ flex: 1 }}>
                <Button
                  variant="outline"
                  size="lg"
                  fullWidth
                  disabled={okLoading}
                  onPress={handleCancel}
                >
                  {cancelLabel}
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  variant={destructive ? 'destructive' : 'primary'}
                  size="lg"
                  fullWidth
                  loading={okLoading}
                  onPress={handleOk}
                >
                  {okLabel}
                </Button>
              </View>
            </View>
          ) : (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={okLoading}
              onPress={handleOk}
            >
              {okLabel}
            </Button>
          )}
        </Pressable>
      </Pressable>
    </RNModal>
  )
}
