import { router, Stack, useLocalSearchParams } from 'expo-router'
import { AlertTriangle, MapPin } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { extractErrorMessage } from '@/apis/api-client'
import type { TTaskDetail } from '@/apis/tasks/tasks-api-types'
import {
  useCancelTaskMutation,
  useStartTaskMutation,
  useTaskByIdQuery,
} from '@/apis/tasks/tasks-hooks'
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
import { useProxyAuth } from '@/feature/auth/hooks/useProxyAuth'
import { TaskTimeline } from '@/feature/tasks/components/TaskTimeline'
import { ValidateTaskSheet } from '@/feature/tasks/components/ValidateTaskSheet'
import { canCancelTask } from '@/feature/tasks/utils/can-cancel'
import { statusLabel } from '@/feature/tasks/utils/status-display'
import { modal } from '@/lib/modal'
import { toast } from '@/lib/toast'
import { Button } from '@/shared/components/Button'
import { ScreenHeader } from '@/shared/components/ScreenHeader'

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: task, isPending, isError } = useTaskByIdQuery(id)
  const { session } = useProxyAuth()
  const insets = useSafeAreaInsets()

  const cancelTask = useCancelTaskMutation()
  const startTask = useStartTaskMutation()
  const [validateSheetOpen, setValidateSheetOpen] = useState(false)

  const isClient = session?.userType === 'CLIENT'
  const isProxy = session?.userType === 'PROXY'
  const clientActions = task && isClient ? clientActionsFor(task) : null
  const proxyCanStart = !!(task && isProxy && task.status === 'available')
  const showActionBar = !!clientActions || proxyCanStart

  const askCancel = () => {
    if (!task) return
    modal.confirm({
      title: 'Cancelar tarefa?',
      message:
        'Essa ação não pode ser desfeita. Se um pagamento foi pré-autorizado, ele será estornado.',
      okLabel: 'Cancelar tarefa',
      destructive: true,
      onOk: async () => {
        try {
          await cancelTask.mutateAsync({ taskId: task.id })
          toast.success('Tarefa cancelada.')
        } catch (e) {
          // Defer to avoid the iOS "already presenting" stacking bug while
          // the confirm modal is finishing its dismiss animation.
          setTimeout(() => modal.error(extractErrorMessage(e)), 280)
        }
      },
    })
  }

  const askContest = () => {
    modal.info('Funcionalidade em breve.')
  }

  const openValidate = () => setValidateSheetOpen(true)

  const askStart = () => {
    if (!task) return
    modal.confirm({
      title: 'Aceitar essa tarefa?',
      message:
        'Ao aceitar, o cartão do cliente será cobrado imediatamente e a tarefa entrará em andamento.',
      okLabel: 'Aceitar e iniciar',
      onOk: async () => {
        try {
          const result = await startTask.mutateAsync({ taskId: task.id })
          if (result.status === 'requires_action') {
            toast.success(
              'Tarefa aceita. Aguardando confirmação do pagamento pelo cliente.',
            )
          } else {
            toast.success('Tarefa aceita! Bom trabalho.')
          }
        } catch (e) {
          setTimeout(() => modal.error(extractErrorMessage(e)), 280)
        }
      },
    })
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <Stack.Screen options={{ gestureEnabled: true }} />
      <ScreenHeader title="Detalhes da tarefa" />

      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingBottom: showActionBar ? 140 + insets.bottom : 24,
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

              {/* TODO(MD.d): photo proof section when task.proofImageUrl exists */}
            </>
          )}
        </ScrollView>

        {task && clientActions ? (
          <ClientActionBar
            actions={clientActions}
            onCancel={askCancel}
            onValidate={openValidate}
            onContest={askContest}
            insetsBottom={insets.bottom}
            cancelLoading={cancelTask.isPending}
          />
        ) : proxyCanStart ? (
          <ProxyActionBar
            onStart={askStart}
            insetsBottom={insets.bottom}
            startLoading={startTask.isPending}
          />
        ) : null}
      </View>

      {task && isClient ? (
        <ValidateTaskSheet
          taskId={task.id}
          visible={validateSheetOpen}
          onClose={() => setValidateSheetOpen(false)}
          onSuccess={() => {
            setValidateSheetOpen(false)
            toast.success('Pagamento liberado. Obrigado!')
          }}
        />
      ) : null}
    </SafeAreaView>
  )
}

// -----------------------------------------------------------------------------
// Client action bar
// -----------------------------------------------------------------------------

type ClientActions = {
  cancel: boolean
  validate: boolean
  contest: boolean
}

function clientActionsFor(task: TTaskDetail): ClientActions | null {
  switch (task.status) {
    case 'available':
      return { cancel: true, validate: false, contest: false }
    case 'in_progress':
      // "Cancelar" hidden after the 1h window per SPEC + user's UX choice.
      return canCancelTask(task)
        ? { cancel: true, validate: false, contest: false }
        : null
    case 'verification_required':
      return { cancel: false, validate: true, contest: true }
    default:
      return null
  }
}

type ActionBarProps = {
  actions: ClientActions
  onCancel: () => void
  onValidate: () => void
  onContest: () => void
  insetsBottom: number
  cancelLoading: boolean
}

function ClientActionBar({
  actions,
  onCancel,
  onValidate,
  onContest,
  insetsBottom,
  cancelLoading,
}: ActionBarProps) {
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: BORDER,
        paddingHorizontal: 24,
        paddingTop: 18,
        paddingBottom: Math.max(18, insetsBottom),
      }}
    >
      {actions.validate ? (
        <>
          <Button
            variant="primary"
            size="xl"
            fullWidth
            onPress={onValidate}
          >
            Validar e pagar
          </Button>
          {actions.contest ? (
            <Pressable
              onPress={onContest}
              hitSlop={8}
              style={({ pressed }) => ({
                marginTop: 12,
                alignItems: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
              accessibilityRole="button"
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: MUTED,
                  letterSpacing: -0.1,
                }}
              >
                Contestar conclusão
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : actions.cancel ? (
        <Button
          variant="destructive"
          size="xl"
          fullWidth
          loading={cancelLoading}
          onPress={onCancel}
        >
          Cancelar tarefa
        </Button>
      ) : null}
    </View>
  )
}

// -----------------------------------------------------------------------------
// Proxy action bar
// -----------------------------------------------------------------------------

type ProxyActionBarProps = {
  onStart: () => void
  insetsBottom: number
  startLoading: boolean
}

function ProxyActionBar({
  onStart,
  insetsBottom,
  startLoading,
}: ProxyActionBarProps) {
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'white',
        borderTopWidth: 1,
        borderTopColor: BORDER,
        paddingHorizontal: 24,
        paddingTop: 18,
        paddingBottom: Math.max(18, insetsBottom),
      }}
    >
      <Button
        variant="primary"
        size="xl"
        fullWidth
        loading={startLoading}
        onPress={onStart}
      >
        Aceitar e iniciar tarefa
      </Button>
    </View>
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

