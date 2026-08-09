import { router, useLocalSearchParams } from 'expo-router'
import { AlertTriangle, MapPin } from 'lucide-react-native'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useTaskByIdQuery } from '@/apis/tasks/tasks-hooks'
import {
  ACCENT,
  ACCENT_TINT_STRONG,
  BG,
  BORDER,
  GRAPHITE,
  MUTED,
  SUBTLE,
} from '@/common/theme/colors'
import { formatBRL, formatDateTime } from '@/common/utils/format'
import { statusLabel } from '@/feature/tasks/utils/status-display'
import { TaskTimeline } from '@/feature/tasks/components/TaskTimeline'
import { Button } from '@/shared/components/Button'
import { ScreenHeader } from '@/shared/components/ScreenHeader'

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: task, isPending, isError } = useTaskByIdQuery(id)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <ScreenHeader title="Detalhes da tarefa" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {isPending ? (
          <DetailLoading />
        ) : isError || !task ? (
          <DetailNotFound />
        ) : (
          <>
            <SummaryCard task={task} />
            <SectionTitle>Andamento</SectionTitle>
            <View
              style={{
                padding: 16,
                borderRadius: 16,
                backgroundColor: 'white',
                borderWidth: 1,
                borderColor: BORDER,
              }}
            >
              <TaskTimeline status={task.status} />
            </View>

            {/* TODO(MD.b/c): sticky action button based on status × role */}
            {/* TODO(MD.d): photo proof section when task.proofImageUrl exists */}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// -----------------------------------------------------------------------------
// Summary card
// -----------------------------------------------------------------------------

type SummaryCardProps = {
  task: {
    title: string
    description: string
    status: import('@/apis/tasks/tasks-api-types').TTaskStatus
    locationAddress: string
    createdAt: string
    offeredPrice: string
  }
}

function SummaryCard({ task }: SummaryCardProps) {
  return (
    <View
      style={{
        marginTop: 8,
        padding: 20,
        borderRadius: 20,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: BORDER,
      }}
    >
      <View
        style={{
          alignSelf: 'flex-start',
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: ACCENT_TINT_STRONG,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: GRAPHITE,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          {statusLabel(task.status)}
        </Text>
      </View>

      <Text
        style={{
          marginTop: 12,
          fontSize: 22,
          fontWeight: '700',
          color: GRAPHITE,
          letterSpacing: -0.4,
          lineHeight: 28,
        }}
      >
        {task.title}
      </Text>

      <Text
        style={{
          marginTop: 8,
          fontSize: 14,
          color: MUTED,
          lineHeight: 20,
        }}
      >
        {task.description}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 14,
        }}
      >
        <MapPin size={14} color={SUBTLE} />
        <Text
          style={{
            marginLeft: 6,
            flex: 1,
            fontSize: 13,
            color: MUTED,
          }}
          numberOfLines={2}
        >
          {task.locationAddress}
        </Text>
      </View>

      <Text
        style={{
          marginTop: 8,
          fontSize: 12,
          color: SUBTLE,
        }}
      >
        Publicada em {formatDateTime(task.createdAt)}
      </Text>

      <View
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: BORDER,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: MUTED,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Valor oferecido
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontSize: 26,
            fontWeight: '700',
            color: GRAPHITE,
            letterSpacing: -0.5,
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatBRL(task.offeredPrice)}
        </Text>
      </View>
    </View>
  )
}

// -----------------------------------------------------------------------------
// Section title
// -----------------------------------------------------------------------------

function SectionTitle({ children }: { children: string }) {
  return (
    <Text
      style={{
        marginTop: 24,
        marginBottom: 10,
        fontSize: 11,
        fontWeight: '700',
        color: MUTED,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  )
}

// -----------------------------------------------------------------------------
// Loading / not-found
// -----------------------------------------------------------------------------

function DetailLoading() {
  return (
    <View style={{ marginTop: 8, gap: 14 }}>
      <View
        style={{
          height: 220,
          borderRadius: 20,
          backgroundColor: 'white',
          borderWidth: 1,
          borderColor: BORDER,
        }}
      />
      <View
        style={{
          height: 180,
          borderRadius: 16,
          backgroundColor: 'white',
          borderWidth: 1,
          borderColor: BORDER,
        }}
      />
    </View>
  )
}

function DetailNotFound() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          backgroundColor: ACCENT_TINT_STRONG,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        <AlertTriangle size={24} color={ACCENT} />
      </View>
      <Text
        style={{
          fontSize: 17,
          fontWeight: '700',
          color: GRAPHITE,
          marginBottom: 6,
          letterSpacing: -0.3,
        }}
      >
        Tarefa não encontrada
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: MUTED,
          textAlign: 'center',
          maxWidth: 260,
          lineHeight: 19,
        }}
      >
        Ela pode ter sido removida ou você não tem acesso a ela.
      </Text>
      <View style={{ marginTop: 20 }}>
        <Button variant="outline" size="lg" onPress={() => router.back()}>
          Voltar
        </Button>
      </View>
    </View>
  )
}

