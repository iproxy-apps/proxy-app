import { Check } from 'lucide-react-native'
import { Controller, useFormContext, type RegisterOptions } from 'react-hook-form'
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native'

const GRAPHITE = 'hsl(220, 10%, 12%)'
const ACCENT = 'hsl(45, 95%, 55%)'
const BORDER = 'hsl(40, 10%, 88%)'
const DESTRUCTIVE = 'hsl(358, 70%, 52%)'

type Props = {
  name: string
  label: React.ReactNode
  rules?: RegisterOptions
  style?: StyleProp<ViewStyle>
}

export function FormCheckbox({ name, label, rules, style }: Props) {
  const { control } = useFormContext()

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field: { value, onChange, onBlur }, fieldState }) => {
        const { error, isTouched } = fieldState
        const checked = !!value
        const showError = !!error?.message && isTouched
        return (
          <View style={style}>
            <Pressable
              onPress={() => {
                onChange(!checked)
                onBlur()
              }}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  marginRight: 10,
                  borderRadius: 6,
                  borderWidth: checked ? 0 : 1.5,
                  borderColor: BORDER,
                  backgroundColor: checked ? ACCENT : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {checked ? (
                  <Check size={14} color={GRAPHITE} strokeWidth={3} />
                ) : null}
              </View>

              <View style={{ flex: 1 }}>
                {typeof label === 'string' ? (
                  <Text
                    style={{ fontSize: 13, color: GRAPHITE, lineHeight: 18 }}
                  >
                    {label}
                  </Text>
                ) : (
                  label
                )}
              </View>
            </Pressable>

            {showError ? (
              <Text
                style={{
                  fontSize: 12,
                  color: DESTRUCTIVE,
                  marginTop: 6,
                  marginLeft: 32,
                }}
              >
                {error?.message}
              </Text>
            ) : null}
          </View>
        )
      }}
    />
  )
}
