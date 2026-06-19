import { useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { extractErrorMessage } from '@/apis/api-client'
import { apis } from '@/apis/apis'
import { BG, GRAPHITE, MUTED } from '@/common/theme/colors'
import { AddCardSheet } from '@/feature/cards/components/AddCardSheet'
import { CardPreview } from '@/feature/cards/components/CardPreview'
import { CardSkeleton } from '@/feature/cards/components/CardSkeleton'
import { EmptyState } from '@/feature/cards/components/EmptyState'
import { modal } from '@/lib/modal'
import { Button } from '@/shared/components/Button'
import { ScreenHeader } from '@/shared/components/ScreenHeader'
import { useCardStore } from '@/store/card-store'

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
