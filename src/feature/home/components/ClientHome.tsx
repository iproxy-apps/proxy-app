import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { ChevronRight, Plus } from 'lucide-react-native'
import { useMemo } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { TSessionPayload } from '@/apis/auth/auth-api-types'
import type { TTask } from '@/apis/tasks/tasks-api-types'
import { useActiveTasksQuery } from '@/apis/tasks/tasks-hooks'
import {
  ACCENT,
  ACCENT_TINT,
  BG,
  BORDER,
  CREAM,
  CREAM_75,
  GRAPHITE,
  MUTED,
  SUBTLE,
} from '@/common/theme/colors'
import { TaskCard } from '@/feature/tasks/components/TaskCard'
import { TaskCardSkeleton } from '@/feature/tasks/components/TaskCardSkeleton'
import { TasksEmptyState } from '@/feature/tasks/components/TasksEmptyState'
import { modal } from '@/lib/modal'
import { Avatar } from '@/shared/components/Avatar'

type Props = {
  session: TSessionPayload
}

/**
 * Home for the CLIENT role — hero saudação, primary CTA to create a task,
 * quick stats, and the user's active tasks list.
 */
export function ClientHome({ session }: Props) {
  const insets = useSafeAreaInsets()
  const firstName = session.name?.split(' ')[0] ?? ''

  const { data: activeTasks, isPending } = useActiveTasksQuery()

  // Backend returns tasks the user is involved in either as owner OR executor;
  // on the Client Home we only care about the ones they created (SPEC §8.6).
  const ownedTasks = useMemo(
    () => (activeTasks ?? []).filter((t) => t.owner === session.sub),
    [activeTasks, session.sub],
  )

  const openCreateTask = () => {
    router.push('/tasks/create')
  }

  const openTask = (task: TTask) => {
    // TODO(milestone 5+): swap for router.push(`/tasks/${task.id}`)
    modal.info(
      `A tela de detalhe de "${task.title}" ainda está sendo construída.`,
    )
  }

  const stats = [
    { label: 'Ativas', value: String(ownedTasks.length) },
    { label: 'Concluídas', value: String(session.totalTasksCompleted ?? 0) },
    {
      label: 'Avaliação',
      value:
        session.rating > 0 ? session.rating.toFixed(1).replace('.', ',') : '—',
    },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="light" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — extends into the status bar */}
        <LinearGradient
          colors={['hsl(220, 12%, 18%)', 'hsl(220, 10%, 8%)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingTop: insets.top + 20,
            paddingHorizontal: 24,
            paddingBottom: 32,
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ marginRight: 14 }}>
              <Avatar name={session.name} size={48} variant="dark" />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 12,
                  color: CREAM_75,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  fontWeight: '700',
                }}
              >
                Olá,
              </Text>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '700',
                  color: CREAM,
                  letterSpacing: -0.3,
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {firstName} 👋
              </Text>
            </View>
          </View>

          <Text
            style={{
              marginTop: 18,
              fontSize: 14,
              color: CREAM_75,
              lineHeight: 20,
            }}
          >
            A gente faz por você.
          </Text>
        </LinearGradient>

        {/* Card CTA */}
        <View style={{ paddingHorizontal: 24, marginTop: 20 }}>
          <Pressable
            onPress={openCreateTask}
            accessibilityRole="button"
            accessibilityLabel="Criar nova tarefa"
          >
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 18,
                  borderRadius: 20,
                  backgroundColor: 'white',
                  borderWidth: 1,
                  borderColor: BORDER,
                  opacity: pressed ? 0.85 : 1,
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
                    marginRight: 14,
                  }}
                >
                  <Plus size={22} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: MUTED,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                    }}
                  >
                    Nova tarefa
                  </Text>
                  <Text
                    style={{
                      marginTop: 2,
                      fontSize: 16,
                      fontWeight: '700',
                      color: GRAPHITE,
                      letterSpacing: -0.2,
                    }}
                  >
                    O que você precisa hoje?
                  </Text>
                </View>
                <ChevronRight size={20} color={SUBTLE} />
              </View>
            )}
          </Pressable>
        </View>

        {/* Stats */}
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 24,
            marginTop: 14,
            gap: 10,
          }}
        >
          {stats.map((s) => (
            <View
              key={s.label}
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 16,
                backgroundColor: 'white',
                borderWidth: 1,
                borderColor: BORDER,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: MUTED,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                }}
              >
                {s.label}
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 22,
                  fontWeight: '700',
                  color: GRAPHITE,
                  letterSpacing: -0.4,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {s.value}
              </Text>
            </View>
          ))}
        </View>

        {/* Active tasks section */}
        <View style={{ paddingHorizontal: 24, marginTop: 28 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: GRAPHITE,
              letterSpacing: -0.3,
              marginBottom: 12,
            }}
          >
            Suas tarefas ativas
          </Text>

          {isPending ? (
            <View style={{ gap: 10 }}>
              <TaskCardSkeleton />
              <TaskCardSkeleton />
            </View>
          ) : ownedTasks.length === 0 ? (
            <TasksEmptyState />
          ) : (
            <View style={{ gap: 10 }}>
              {ownedTasks.map((task) => (
                <TaskCard key={task.id} task={task} onPress={openTask} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
