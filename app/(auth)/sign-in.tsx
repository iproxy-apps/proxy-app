import { router } from 'expo-router'
import { Eye, EyeOff } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '../../src/components/Button'
import { FormInput } from '../../src/components/form/FormInput'
import { Logo } from '../../src/components/Logo'
import { ScreenHeader } from '../../src/components/ScreenHeader'
import { useProxyAuth } from '../../src/hooks/useProxyAuth'
import { extractErrorMessage } from '../../src/lib/api/client'
import { modal } from '../../src/lib/modal'

const GRAPHITE = 'hsl(220, 10%, 12%)'
const MUTED = 'hsl(220, 8%, 42%)'
const BG = 'hsl(40, 20%, 97%)'

type SignInFormData = {
  email: string
  password: string
}

export default function SignIn() {
  const { signIn } = useProxyAuth()
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const passwordRef = useRef<TextInput>(null)

  const form = useForm<SignInFormData>({
    mode: 'all',
    defaultValues: { email: '', password: '' },
  })

  const { isValid } = form.formState

  const onSubmit = form.handleSubmit(async (data) => {
    setSubmitting(true)
    try {
      await signIn({
        email: data.email.trim().toLowerCase(),
        password: data.password,
      })
    } catch (e) {
      modal.error(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <ScreenHeader />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: 24,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingTop: 4 }}>
            <Logo color={GRAPHITE} />
          </View>

          <View style={{ marginTop: 28 }}>
            <Text
              style={{
                fontSize: 30,
                fontWeight: '700',
                color: GRAPHITE,
                letterSpacing: -0.5,
                lineHeight: 36,
              }}
            >
              Bem-vindo de volta
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontSize: 14,
                color: MUTED,
                lineHeight: 20,
              }}
            >
              Entre para continuar.
            </Text>
          </View>

          <FormProvider {...form}>
            <View style={{ marginTop: 24, gap: 16 }}>
              <FormInput
                name="email"
                label="Email"
                placeholder="voce@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordRef.current?.focus()}
                rules={{
                  required: 'Informe seu email.',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Email inválido.',
                  },
                }}
              />

              <FormInput
                ref={passwordRef}
                name="password"
                label="Senha"
                placeholder="Sua senha"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={() => onSubmit()}
                rightSlot={
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? 'Ocultar senha' : 'Mostrar senha'
                    }
                    style={({ pressed }) => ({
                      padding: 8,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color={MUTED} />
                    ) : (
                      <Eye size={18} color={MUTED} />
                    )}
                  </Pressable>
                }
                rules={{ required: 'Informe sua senha.' }}
              />
            </View>
          </FormProvider>

          <View style={{ marginTop: 32 }}>
            <Button
              variant="primary"
              size="xl"
              fullWidth
              loading={submitting}
              disabled={!isValid}
              onPress={onSubmit}
            >
              Entrar
            </Button>

            <View
              style={{
                marginTop: 16,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 13, color: MUTED }}>
                Não tem conta?
              </Text>
              <Pressable
                onPress={() => router.replace('/(auth)/choose-profile')}
                hitSlop={6}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text
                  style={{ fontSize: 13, fontWeight: '700', color: GRAPHITE }}
                >
                  Criar conta
                </Text>
              </Pressable>
            </View>

            <View
              style={{
                marginTop: 14,
                flexDirection: 'row',
                justifyContent: 'center',
              }}
            >
              <Pressable
                onPress={() => router.push('/(auth)/forgot-password')}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: MUTED,
                  }}
                >
                  Esqueci a senha
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
