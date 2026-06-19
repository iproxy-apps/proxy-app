import { ChevronRight } from 'lucide-react-native'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import { BORDER, GRAPHITE, MUTED, SUBTLE } from '@/common/theme/colors'

/**
 * Visual divider between menu rows. Indented to align with the row labels.
 */
export function MenuListDivider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: BORDER,
        marginLeft: 18,
      }}
    />
  )
}

type MenuRowProps = {
  label: string
  hint?: string
  loading?: boolean
  onPress: () => void
}

/**
 * Settings-style tappable row with label, optional inline hint, chevron, and
 * a loading state that replaces the hint while data resolves.
 */
export function MenuRow({ label, hint, loading, onPress }: MenuRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <View style={menuStyles.row}>
        <Text style={menuStyles.label} numberOfLines={1}>
          {label}
        </Text>

        {loading ? (
          <ActivityIndicator
            size="small"
            color={MUTED}
            style={{ marginRight: 8 }}
          />
        ) : hint ? (
          <Text style={menuStyles.hint}>{hint}</Text>
        ) : null}

        <ChevronRight size={18} color={SUBTLE} />
      </View>
    </TouchableOpacity>
  )
}

const menuStyles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: GRAPHITE,
  },
  hint: {
    fontSize: 13,
    color: MUTED,
    marginRight: 8,
    fontVariant: ['tabular-nums'],
  },
})
