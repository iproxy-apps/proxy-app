import { Sparkles } from 'lucide-react-native'
import { Text, View } from 'react-native'

import {
  ACCENT,
  ACCENT_TINT,
  BORDER,
  GRAPHITE,
  MUTED,
} from '@/common/theme/colors'

export function TasksEmptyState() {
  return (
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
        Nenhuma tarefa ativa
      </Text>
      <Text style={{ fontSize: 13, color: MUTED, lineHeight: 19 }}>
        Crie sua primeira tarefa e veja o Proxy fazer mágica.
      </Text>
    </View>
  )
}
