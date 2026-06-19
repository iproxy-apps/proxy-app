import { useRef, useState, useEffect } from 'react'
import {
  TextInput,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  View,
} from 'react-native'

import { BORDER, FOCUS, GRAPHITE } from '@/common/theme/colors'

type Props = {
  length?: number
  value: string
  onChange: (value: string) => void
  /** Called when all boxes are filled (handy to auto-submit). */
  onComplete?: (value: string) => void
  autoFocus?: boolean
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus = false,
}: Props) {
  const inputs = useRef<(TextInput | null)[]>(
    Array(length).fill(null),
  )
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  // Normalize external value into a fixed-length digit array.
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputs.current[0]?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [autoFocus])

  const setDigitAt = (i: number, digit: string) => {
    const cleaned = digit.replace(/\D/g, '')
    if (cleaned.length === 0) {
      // Cleared a digit (user pressed backspace on a filled box).
      // Clear the digit AND move focus back so the next backspace
      // immediately clears the previous one — one keystroke per digit.
      const wasFilled = digits[i] !== ''
      const next = digits.slice()
      next[i] = ''
      const newValue = next.join('')
      onChange(newValue)
      if (wasFilled && i > 0) {
        inputs.current[i - 1]?.focus()
      }
      return
    }

    // Paste support: if multiple digits arrive, distribute across boxes.
    // If a full-length code is pasted, distribute from the start regardless
    // of which box was focused — that's the natural "paste the whole code".
    if (cleaned.length > 1) {
      const startIndex = cleaned.length >= length ? 0 : i
      const next = digits.slice()
      for (let j = 0; j < cleaned.length && startIndex + j < length; j++) {
        next[startIndex + j] = cleaned[j]
      }
      const newValue = next.join('')
      onChange(newValue)
      const lastFilled = Math.min(startIndex + cleaned.length - 1, length - 1)
      const nextFocus = Math.min(lastFilled + 1, length - 1)
      inputs.current[nextFocus]?.focus()
      if (newValue.length === length && /^\d+$/.test(newValue)) {
        onComplete?.(newValue)
      }
      return
    }

    // Single digit: set and advance.
    const next = digits.slice()
    next[i] = cleaned
    const newValue = next.join('')
    onChange(newValue)
    if (i < length - 1) {
      inputs.current[i + 1]?.focus()
    }
    if (newValue.length === length && newValue.replace(/\D/g, '').length === length) {
      onComplete?.(newValue)
    }
  }

  const handleKeyPress = (
    i: number,
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    if (e.nativeEvent.key !== 'Backspace') return
    // The filled-box case is handled in setDigitAt (onChangeText fires on
    // deletion). This branch only handles backspace on an already-empty box:
    // clear the previous digit AND move focus there in a single keystroke.
    if (digits[i] === '' && i > 0) {
      const next = digits.slice()
      next[i - 1] = ''
      onChange(next.join(''))
      inputs.current[i - 1]?.focus()
    }
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        justifyContent: 'center',
      }}
    >
      {digits.map((digit, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            inputs.current[i] = el
          }}
          value={digit}
          onChangeText={(val) => setDigitAt(i, val)}
          onKeyPress={(e) => handleKeyPress(i, e)}
          onFocus={() => setFocusedIndex(i)}
          onBlur={() => setFocusedIndex(null)}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={length}
          selectTextOnFocus
          style={{
            width: 48,
            height: 56,
            borderWidth: focusedIndex === i ? 2 : 1,
            borderColor: focusedIndex === i ? FOCUS : BORDER,
            borderRadius: 12,
            backgroundColor: 'white',
            textAlign: 'center',
            fontSize: 22,
            fontWeight: '700',
            color: GRAPHITE,
          }}
        />
      ))}
    </View>
  )
}
