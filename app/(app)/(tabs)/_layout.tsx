import { Tabs } from 'expo-router'
import { History, Home, User, Wallet } from 'lucide-react-native'
import { Platform, StyleSheet } from 'react-native'

import { useProxyAuth } from '@/feature/auth/hooks/useProxyAuth'

import { BG, BORDER, GRAPHITE, MUTED } from '@/common/theme/colors'

type IconProps = { color: string; focused: boolean }

const makeIcon = (Icon: typeof Home) => {
  function TabIcon({ color, focused }: IconProps) {
    return <Icon size={22} color={color} strokeWidth={focused ? 2.2 : 1.75} />
  }
  return TabIcon
}

export default function TabsLayout() {
  const { session } = useProxyAuth()
  const isProxy = session?.userType === 'PROXY'

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GRAPHITE,
        tabBarInactiveTintColor: MUTED,
        tabBarStyle: {
          backgroundColor: BG,
          borderTopColor: BORDER,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.1,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarLabel: isProxy ? 'Tarefas' : 'Início',
          tabBarIcon: makeIcon(Home),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          tabBarLabel: 'Carteira',
          tabBarIcon: makeIcon(Wallet),
          ...(isProxy ? {} : { href: null }),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarLabel: 'Histórico',
          tabBarIcon: makeIcon(History),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarLabel: 'Perfil',
          tabBarIcon: makeIcon(User),
        }}
      />
    </Tabs>
  )
}
