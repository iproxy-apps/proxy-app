import { forwardRef, useState, type ReactNode } from 'react'
import { Controller, useFormContext, type RegisterOptions } from 'react-hook-form'
import { Text, TextInput, type TextInputProps, View } from 'react-native'

import {
  BORDER,
  DESTRUCTIVE,
  FOCUS,
  GRAPHITE,
  MUTED,
  SUBTLE,
} from '@/common/theme/colors'

type Props = Omit<TextInputProps, 'value' | 'onChangeText' | 'onBlur'> & {
  name: string
  label?: string
  hint?: string
  rules?: RegisterOptions
  /** Optional transform applied to user input before storing (e.g., mask functions). */
  format?: (value: string) => string
  /** Optional element rendered inside the input box, on the left (e.g., type chip). */
  leftSlot?: ReactNode
  /** Optional element rendered inside the input box, on the right (e.g., eye icon). */
  rightSlot?: ReactNode
}

export const FormInput = forwardRef<TextInput, Props>(function FormInput(
  {
    name,
    label,
    hint,
    rules,
    format,
    placeholder,
    leftSlot,
    rightSlot,
    ...inputProps
  },
  ref,
) {
  const { control } = useFormContext()
  const [focused, setFocused] = useState(false)

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field: { value, onChange, onBlur }, fieldState }) => {
        const { error, isTouched } = fieldState
        const showError = !!error?.message && isTouched
        const borderColor = showError ? DESTRUCTIVE : focused ? FOCUS : BORDER

        return (
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

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor,
                borderRadius: 12,
                backgroundColor: 'white',
                paddingLeft: leftSlot ? 6 : 0,
                paddingRight: rightSlot ? 12 : 0,
              }}
            >
              {leftSlot}
              <TextInput
                ref={ref}
                value={value ?? ''}
                onChangeText={(text) => onChange(format ? format(text) : text)}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false)
                  onBlur()
                }}
                placeholder={placeholder}
                placeholderTextColor={SUBTLE}
                style={{
                  flex: 1,
                  paddingHorizontal: leftSlot ? 10 : 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: GRAPHITE,
                }}
                {...inputProps}
              />
              {rightSlot}
            </View>

            {showError ? (
              <Text style={{ fontSize: 12, color: DESTRUCTIVE, marginTop: 6 }}>
                {error?.message}
              </Text>
            ) : hint ? (
              <Text style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
                {hint}
              </Text>
            ) : null}
          </View>
        )
      }}
    />
  )
})
