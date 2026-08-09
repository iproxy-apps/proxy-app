import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { ChevronRight, Search, Sparkles } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { TSessionPayload } from '@/apis/auth/auth-api-types'
import type { TTask } from '@/apis/tasks/tasks-api-types'
import { useAvailableTasksInfiniteQuery } from '@/apis/tasks/tasks-hooks'
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
import { formatBRL } from '@/common/utils/format'
import { haversineKm } from '@/common/utils/haversine'
import { TaskCard } from '@/feature/tasks/components/TaskCard'
import { TaskCardSkeleton } from '@/feature/tasks/components/TaskCardSkeleton'
import { useDeviceLocation } from '@/feature/tasks/hooks/useDeviceLocation'
import { Avatar } from '@/shared/components/Avatar'

type Props = {
  session: TSessionPayload
}

const CITIES = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte'] as const

export function ProxyHome({ session }: Props) {
  const insets = useSafeAreaInsets()
  const firstName = session.name?.split(' ')[0] ?? ''

  const [city, setCity] = useState<string>('São Paulo')
  const [search, setSearch] = useState('')

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useAvailableTasksInfiniteQuery(city)

  const { position: devicePosition } = useDeviceLocation()

  const tasks = useMemo(() => {
    const flat = data?.pages.flat() ?? []
    const q = search.trim().toLowerCase()
    if (!q) return flat
    return flat.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.locationAddress.toLowerCase().includes(q),
    )
  }, [data, search])

  const openWallet = () => {
    router.navigate('/wallet')
  }

  const openTask = (task: TTask) => {
    router.push(`/tasks/${task.id}`)
  }

  const onEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="light" />

      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 24 }}>
            <TaskCard
              task={item}
              onPress={openTask}
              distanceKm={
                devicePosition
                  ? haversineKm(devicePosition, {
                      lat: Number(item.locationLat),
                      lng: Number(item.locationLng),
                    })
                  : null
              }
            />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <ProxyHomeHeader
            session={session}
            firstName={firstName}
            insetsTop={insets.top}
            city={city}
            onCityChange={setCity}
            search={search}
            onSearchChange={setSearch}
            openWallet={openWallet}
            resultCount={tasks.length}
            loading={isPending}
          />
        }
        ListEmptyComponent={
          isPending ? (
            <TaskListSkeletons />
          ) : (
            <TasksListEmpty hasSearch={search.trim().length > 0} />
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={MUTED} />
            </View>
          ) : null
        }
      />
    </View>
  )
}

// -----------------------------------------------------------------------------
// Header (hero + saldo + search + pills + section title)
// -----------------------------------------------------------------------------

type HeaderProps = {
  session: TSessionPayload
  firstName: string
  insetsTop: number
  city: string
  onCityChange: (city: string) => void
  search: string
  onSearchChange: (v: string) => void
  openWallet: () => void
  resultCount: number
  loading: boolean
}

function ProxyHomeHeader({
  session,
  firstName,
  insetsTop,
  city,
  onCityChange,
  search,
  onSearchChange,
  openWallet,
  resultCount,
  loading,
}: HeaderProps) {
  return (
    <View>
      {/* Hero */}
      <LinearGradient
        colors={['hsl(220, 12%, 18%)', 'hsl(220, 10%, 8%)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insetsTop + 20,
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
              {firstName} 👋🏻
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
          Encontre tarefas perto de você.
        </Text>
      </LinearGradient>

      {/* Saldo card */}
      <View style={{ paddingHorizontal: 24, marginTop: 20 }}>
        <Pressable
          onPress={openWallet}
          accessibilityRole="button"
          accessibilityLabel="Abrir carteira"
        >
          {({ pressed }) => (
            <View
              style={{
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
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 4,
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
                  Saldo na carteira
                </Text>
                <ChevronRight size={18} color={SUBTLE} />
              </View>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: '700',
                  color: GRAPHITE,
                  letterSpacing: -0.5,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatBRL(session.walletBalance ?? 0)}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 24, marginTop: 20 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: BORDER,
            borderRadius: 12,
            backgroundColor: 'white',
            paddingHorizontal: 14,
          }}
        >
          <Search size={16} color={SUBTLE} />
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder="Buscar tarefa..."
            placeholderTextColor={SUBTLE}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{
              flex: 1,
              marginLeft: 10,
              paddingVertical: 12,
              fontSize: 15,
              color: GRAPHITE,
            }}
          />
        </View>
      </View>

      {/* City pills */}
      <View
        style={{
          paddingHorizontal: 24,
          marginTop: 12,
          flexDirection: 'row',
          gap: 8,
        }}
      >
        {CITIES.map((c) => {
          const selected = city === c
          return (
            <Pressable
              key={c}
              onPress={() => onCityChange(c)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: selected ? GRAPHITE : 'white',
                    borderWidth: 1,
                    borderColor: selected ? GRAPHITE : BORDER,
                    opacity: pressed ? 0.75 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: selected ? CREAM : GRAPHITE,
                      letterSpacing: 0.2,
                    }}
                  >
                    {c}
                  </Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </View>

      {/* Section header */}
      <View
        style={{
          paddingHorizontal: 24,
          marginTop: 28,
          marginBottom: 12,
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight: '700',
            color: GRAPHITE,
            letterSpacing: -0.3,
          }}
        >
          Tarefas disponíveis
        </Text>
        {!loading ? (
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color: MUTED,
              letterSpacing: 0.2,
              fontVariant: ['tabular-nums'],
            }}
          >
            {resultCount} ativas
          </Text>
        ) : null}
      </View>
    </View>
  )
}

// -----------------------------------------------------------------------------
// Loading + empty
// -----------------------------------------------------------------------------

function TaskListSkeletons() {
  return (
    <View style={{ paddingHorizontal: 24, gap: 10 }}>
      <TaskCardSkeleton />
      <TaskCardSkeleton />
      <TaskCardSkeleton />
    </View>
  )
}

function TasksListEmpty({ hasSearch }: { hasSearch: boolean }) {
  return (
    <View style={{ paddingHorizontal: 24 }}>
      <View
        style={{
          padding: 20,
          borderRadius: 16,
          backgroundColor: 'white',
          borderWidth: 1,
          borderColor: BORDER,
          alignItems: 'flex-start',
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: ACCENT_TINT,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <Sparkles size={20} color={ACCENT} />
        </View>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: GRAPHITE,
            letterSpacing: -0.2,
            marginBottom: 4,
          }}
        >
          {hasSearch ? 'Nenhum resultado' : 'Nenhuma tarefa por aqui'}
        </Text>
        <Text style={{ fontSize: 13, color: MUTED, lineHeight: 19 }}>
          {hasSearch
            ? 'Tente outra palavra ou limpe a busca.'
            : 'Tente trocar de cidade ou volte em alguns minutos.'}
        </Text>
      </View>
    </View>
  )
}
