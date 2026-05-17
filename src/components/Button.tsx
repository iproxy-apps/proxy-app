import { forwardRef } from 'react'
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  Text,
} from 'react-native'

type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'destructive'
type Size = 'md' | 'lg' | 'xl'

type Props = Omit<PressableProps, 'children'> & {
  children: string
  variant?: Variant
  size?: Size
  loading?: boolean
  fullWidth?: boolean
}

const containerByVariant: Record<Variant, string> = {
  primary: 'bg-primary active:opacity-90',
  accent: 'bg-accent active:opacity-90',
  outline: 'bg-transparent border border-border active:bg-secondary',
  ghost: 'bg-transparent active:bg-white/10',
  destructive: 'bg-destructive active:opacity-90',
}

const textByVariant: Record<Variant, string> = {
  primary: 'text-primary-foreground',
  accent: 'text-accent-foreground',
  outline: 'text-foreground',
  ghost: 'text-primary-foreground',
  destructive: 'text-white',
}

const containerBySize: Record<Size, string> = {
  md: 'h-11 px-4 rounded-xl',
  lg: 'h-12 px-5 rounded-xl',
  xl: 'h-14 px-6 rounded-2xl',
}

const textBySize: Record<Size, string> = {
  md: 'text-[14px]',
  lg: 'text-[15px]',
  xl: 'text-[16px]',
}

export const Button = forwardRef<unknown, Props>(function Button(
  {
    children,
    variant = 'primary',
    size = 'lg',
    loading = false,
    fullWidth = false,
    disabled,
    className,
    ...rest
  },
  _ref,
) {
  const isDisabled = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={[
        'items-center justify-center',
        containerBySize[size],
        containerByVariant[variant],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'opacity-60' : '',
        typeof className === 'string' ? className : '',
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color="white" />
      ) : (
        <Text
          className={[
            'font-semibold',
            textBySize[size],
            textByVariant[variant],
          ].join(' ')}
        >
          {children}
        </Text>
      )}
    </Pressable>
  )
})
