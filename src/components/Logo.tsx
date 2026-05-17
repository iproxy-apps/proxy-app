import { Text, View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'

type Props = {
  withText?: boolean
  color?: string
  size?: number
}

export function Logo({
  withText = true,
  color = 'currentColor',
  size = 28,
}: Props) {
  return (
    <View className="flex-row items-center gap-2">
      <Svg viewBox="0 0 32 32" width={size} height={size}>
        <Defs>
          <LinearGradient id="logoG" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="hsl(45, 95%, 60%)" />
            <Stop offset="100%" stopColor="hsl(40, 35%, 88%)" />
          </LinearGradient>
        </Defs>
        <Path
          d="M6 24V10a4 4 0 0 1 4-4h7a7 7 0 0 1 0 14h-5"
          stroke="url(#logoG)"
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Circle cx="22" cy="24" r="2.6" fill="url(#logoG)" />
      </Svg>
      {withText && (
        <Text
          className="text-[22px] font-bold tracking-tight"
          style={{ color }}
        >
          Proxy
        </Text>
      )}
    </View>
  )
}
