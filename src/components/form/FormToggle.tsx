import { Controller, useFormContext, type RegisterOptions } from 'react-hook-form'
import { Pressable, Text, View } from 'react-native'

const GRAPHITE = 'hsl(220, 10%, 12%)'
const MUTED = 'hsl(220, 8%, 42%)'
const BORDER = 'hsl(40, 10%, 88%)'
const DESTRUCTIVE = 'hsl(358, 70%, 52%)'

type Option<T extends string> = {
  value: T
  label: string
}

type Props<T extends string> = {
  name: string
  label?: string
  options: readonly Option<T>[]
  rules?: RegisterOptions
}

export function FormToggle<T extends string>({
  name,
  label,
  options,
  rules,
}: Props<T>) {
  const { control } = useFormContext()

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <View>
          {label ? (
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: GRAPHITE,
                marginBottom: 6,
              }}
            >
              {label}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {options.map((opt) => {
              const isSelected = value === opt.value
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => onChange(opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  style={{
                    borderWidth: 1,
                    borderColor: isSelected ? GRAPHITE : BORDER,
                    backgroundColor: isSelected ? GRAPHITE : 'white',
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: isSelected ? 'hsl(40, 20%, 96%)' : MUTED,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {error?.message ? (
            <Text style={{ fontSize: 12, color: DESTRUCTIVE, marginTop: 6 }}>
              {error.message}
            </Text>
          ) : null}
        </View>
      )}
    />
  )
}

export type { Option as FormToggleOption }
