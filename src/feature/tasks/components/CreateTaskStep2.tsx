import { router } from 'expo-router'
import { CheckCircle2, CreditCard, MapPin, Plus } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { extractErrorMessage } from '@/apis/api-client'
import { useCardQuery } from '@/apis/cards/cards-hooks'
import { useCreateTaskMutation } from '@/apis/tasks/tasks-hooks'
import {
  ACCENT,
  ACCENT_TINT,
  BORDER,
  GRAPHITE,
  GRAPHITE_TINT,
  MUTED,
  SUCCESS,
  SUCCESS_TINT,
} from '@/common/theme/colors'
import { parseBRLToNumber } from '@/common/utils/masks'
import { AddCardSheet } from '@/feature/cards/components/AddCardSheet'
import { brandDisplay } from '@/feature/cards/utils/brand-display'
import { modal } from '@/lib/modal'
import { toast } from '@/lib/toast'
import { Button } from '@/shared/components/Button'
import { PriceBreakdown } from './PriceBreakdown'
import type { Step1Submit } from './CreateTaskStep1'

type Props = {
  draft: Step1Submit
}

export function CreateTaskStep2({ draft }: Props) {
  const { data: card } = useCardQuery()
  const createTask = useCreateTaskMutation()
  const [sheetOpen, setSheetOpen] = useState(false)

  const offeredPrice = parseBRLToNumber(draft.offeredPrice)
  const canPublish = !!card && !createTask.isPending

  const handlePublish = async () => {
    if (!card) return
    try {
      await createTask.mutateAsync({
        title: draft.title,
        description: draft.description,
        address: {
          city: draft.city,
          state: draft.state,
          street: draft.street,
          zipCode: draft.zipCode,
          locationLat: draft.locationLat,
          locationLng: draft.locationLng,
        },
        pricing: { offeredPrice },
        cardDetails: { savedCard: card.stripeCardId },
      })
      toast.success('Tarefa publicada! Aguardando um Proxy.')
      router.dismissTo('/home')
    } catch (e) {
      modal.error(extractErrorMessage(e))
    }
  }

  return (
    <View>
      <Text
        style={{
          fontSize: 26,
          fontWeight: '700',
          color: GRAPHITE,
          letterSpacing: -0.4,
          lineHeight: 32,
        }}
      >
        Pagamento
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 14,
          color: MUTED,
          lineHeight: 20,
        }}
      >
        Confirme os detalhes e publique. O valor fica retido até você validar a
        conclusão.
      </Text>

      {/* Task summary */}
      <View style={{ marginTop: 24 }}>
        <SectionTitle>Resumo da tarefa</SectionTitle>
        <View
          style={{
            padding: 16,
            borderRadius: 16,
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: BORDER,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: GRAPHITE,
              letterSpacing: -0.2,
            }}
          >
            {draft.title}
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 13,
              color: MUTED,
              lineHeight: 19,
            }}
            numberOfLines={3}
          >
            {draft.description}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: BORDER,
            }}
          >
            <MapPin size={12} color={MUTED} />
            <Text
              style={{
                marginLeft: 6,
                fontSize: 12,
                color: MUTED,
                flex: 1,
              }}
              numberOfLines={2}
            >
              {[draft.street, `${draft.city} — ${draft.state}`, draft.zipCode]
                .filter(Boolean)
                .join(', ')}
            </Text>
          </View>
        </View>
      </View>

      {/* Card */}
      <View style={{ marginTop: 24 }}>
        <SectionTitle>Cartão</SectionTitle>
        {card ? <SavedCardRow card={card} /> : <AddCardRow onPress={() => setSheetOpen(true)} />}
      </View>

      {/* Breakdown */}
      <View style={{ marginTop: 24 }}>
        <SectionTitle>Detalhes do pagamento</SectionTitle>
        <PriceBreakdown offeredPrice={offeredPrice} />
      </View>

      <Text
        style={{
          marginTop: 16,
          fontSize: 12,
          color: MUTED,
          lineHeight: 18,
          textAlign: 'center',
        }}
      >
        O valor fica retido com segurança e só é repassado ao Proxy quando você
        validar a conclusão.
      </Text>

      <View style={{ flex: 1 }} />

      <View style={{ marginTop: 24 }}>
        <Button
          variant="primary"
          size="xl"
          fullWidth
          loading={createTask.isPending}
          disabled={!canPublish}
          onPress={handlePublish}
        >
          Publicar tarefa
        </Button>
      </View>

      <AddCardSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSuccess={() => setSheetOpen(false)}
      />
    </View>
  )
}

// -----------------------------------------------------------------------------

function SectionTitle({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 15,
        fontWeight: '700',
        color: GRAPHITE,
        letterSpacing: -0.2,
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  )
}

function SavedCardRow({
  card,
}: {
  card: { brand: string; last4: string }
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 12,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: BORDER,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: GRAPHITE_TINT,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <CreditCard size={18} color={GRAPHITE} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '700',
            color: GRAPHITE,
            letterSpacing: -0.2,
          }}
        >
          {brandDisplay(card.brand)}
        </Text>
        <Text
          style={{
            marginTop: 2,
            fontSize: 12,
            color: MUTED,
            fontVariant: ['tabular-nums'],
          }}
        >
          •••• {card.last4}
        </Text>
      </View>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: SUCCESS_TINT,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CheckCircle2 size={16} color={SUCCESS} />
      </View>
    </View>
  )
}

function AddCardRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Adicionar cartão"
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 14,
            borderRadius: 12,
            backgroundColor: ACCENT_TINT,
            borderWidth: 1,
            borderColor: BORDER,
            opacity: pressed ? 0.75 : 1,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Plus size={18} color={ACCENT} />
          </View>
          <Text
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: '700',
              color: GRAPHITE,
              letterSpacing: -0.2,
            }}
          >
            Adicionar cartão
          </Text>
        </View>
      )}
    </Pressable>
  )
}
