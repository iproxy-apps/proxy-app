import { router } from 'expo-router'
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
} from 'lucide-react-native'
import { useRef, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
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
import { OtpInput } from '../../src/components/form/OtpInput'
import { ScreenHeader } from '../../src/components/ScreenHeader'
import { extractErrorMessage } from '../../src/lib/api/client'
import { apis } from '../../src/lib/api/routes'
import { modal } from '../../src/lib/modal'

const GRAPHITE = 'hsl(220, 10%, 12%)'
const MUTED = 'hsl(220, 8%, 42%)'
const BORDER = 'hsl(40, 10%, 88%)'
const ACCENT_TINT = 'hsla(220, 10%, 12%, 0.06)'
const BG = 'hsl(40, 20%, 97%)'

type Step = 1 | 2 | 3

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')

  const handleBack = () => {
    if (step === 1) {
      router.back()
    } else {
      setStep((step - 1) as Step)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <ScreenHeader title="Recuperar senha" onBack={handleBack} />

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
          <ProgressBar current={step} total={3} />

          {step === 1 && (
            <EmailStep
              defaultEmail={email}
              onContinue={(submittedEmail) => {
                setEmail(submittedEmail)
                setStep(2)
              }}
            />
          )}
          {step === 2 && (
            <CodeStep
              email={email}
              onContinue={(submittedCode) => {
                setCode(submittedCode)
                setStep(3)
              }}
            />
          )}
          {step === 3 && (
            <PasswordStep
              email={email}
              code={code}
              onSuccess={() => {
                modal.show({
                  variant: 'success',
                  title: 'Senha alterada!',
                  message: 'Use a nova senha para entrar.',
                  okLabel: 'Ir para login',
                  onOk: () => router.dismissTo('/(auth)/sign-in'),
                })
              }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// -----------------------------------------------------------------------------
// Progress bar (3 segments)
// -----------------------------------------------------------------------------

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 6,
        marginTop: 8,
        marginBottom: 28,
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 999,
            backgroundColor: i < current ? GRAPHITE : BORDER,
          }}
        />
      ))}
    </View>
  )
}

// -----------------------------------------------------------------------------
// Step icon header (used by all steps)
// -----------------------------------------------------------------------------

type StepHeaderProps = {
  Icon: typeof Mail
  title: string
  subtitle: string | React.ReactNode
}

function StepHeader({ Icon, title, subtitle }: StepHeaderProps) {
  return (
    <View>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          backgroundColor: ACCENT_TINT,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={22} color={GRAPHITE} />
      </View>

      <Text
        style={{
          marginTop: 18,
          fontSize: 26,
          fontWeight: '700',
          color: GRAPHITE,
          letterSpacing: -0.4,
          lineHeight: 32,
        }}
      >
        {title}
      </Text>

      {typeof subtitle === 'string' ? (
        <Text
          style={{
            marginTop: 6,
            fontSize: 14,
            color: MUTED,
            lineHeight: 20,
          }}
        >
          {subtitle}
        </Text>
      ) : (
        <View style={{ marginTop: 6 }}>{subtitle}</View>
      )}
    </View>
  )
}

// -----------------------------------------------------------------------------
// Step 1: Email
// -----------------------------------------------------------------------------

type EmailStepProps = {
  defaultEmail: string
  onContinue: (email: string) => void
}

type EmailFormData = { email: string }

function EmailStep({ defaultEmail, onContinue }: EmailStepProps) {
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<EmailFormData>({
    mode: 'all',
    defaultValues: { email: defaultEmail },
  })
  const { isValid } = form.formState

  const onSubmit = form.handleSubmit(async (data) => {
    const email = data.email.trim().toLowerCase()
    setSubmitting(true)
    try {
      await apis.auth.forgotPassword({ email })
      onContinue(email)
    } catch (e) {
      modal.error(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <View>
      <StepHeader
        Icon={Mail}
        title="Qual seu email?"
        subtitle="Vamos enviar um código de 6 dígitos."
      />

      <FormProvider {...form}>
        <View style={{ marginTop: 24 }}>
          <FormInput
            name="email"
            label="Email"
            placeholder="voce@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={() => onSubmit()}
            rules={{
              required: 'Informe seu email.',
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Email inválido.',
              },
            }}
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
          Continuar
        </Button>
      </View>
    </View>
  )
}

// -----------------------------------------------------------------------------
// Step 2: Code
// -----------------------------------------------------------------------------

type CodeStepProps = {
  email: string
  onContinue: (code: string) => void
}

function CodeStep({ email, onContinue }: CodeStepProps) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)

  const isValid = code.length === 6 && /^\d{6}$/.test(code)

  const onSubmit = async () => {
    if (!isValid) return
    setSubmitting(true)
    try {
      await apis.auth.verifyResetCode({ email, code })
      onContinue(code)
    } catch (e) {
      modal.error(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  const onResend = async () => {
    setResending(true)
    try {
      await apis.auth.forgotPassword({ email })
      modal.success('Código reenviado. Confira seu email.')
    } catch (e) {
      modal.error(extractErrorMessage(e))
    } finally {
      setResending(false)
    }
  }

  return (
    <View>
      <StepHeader
        Icon={KeyRound}
        title="Digite o código"
        subtitle={
          <Text style={{ fontSize: 14, color: MUTED, lineHeight: 20 }}>
            Enviado para{' '}
            <Text style={{ fontWeight: '700', color: GRAPHITE }}>{email}</Text>
            .
          </Text>
        }
      />

      <View style={{ marginTop: 28 }}>
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={(v) => {
            setCode(v)
          }}
          autoFocus
        />
      </View>

      <View style={{ marginTop: 18, alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 12, color: MUTED }}>
          Código válido por 15 minutos.
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Text style={{ fontSize: 13, color: MUTED }}>Não recebeu?</Text>
          <Pressable
            onPress={onResend}
            disabled={resending}
            hitSlop={6}
            style={({ pressed }) => ({
              opacity: pressed || resending ? 0.5 : 1,
            })}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: GRAPHITE }}>
              Reenviar código
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 32 }}>
        <Button
          variant="primary"
          size="xl"
          fullWidth
          loading={submitting}
          disabled={!isValid}
          onPress={onSubmit}
        >
          Continuar
        </Button>
      </View>
    </View>
  )
}

// -----------------------------------------------------------------------------
// Step 3: New password
// -----------------------------------------------------------------------------

type PasswordStepProps = {
  email: string
  code: string
  onSuccess: () => void
}

type PasswordFormData = {
  newPassword: string
  confirmPassword: string
}

function PasswordStep({ email, code, onSuccess }: PasswordStepProps) {
  const [submitting, setSubmitting] = useState(false)
  const [show, setShow] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const confirmPasswordRef = useRef<TextInput>(null)

  const form = useForm<PasswordFormData>({
    mode: 'all',
    defaultValues: { newPassword: '', confirmPassword: '' },
  })
  const { isValid } = form.formState
  const newPassword = useWatch({
    control: form.control,
    name: 'newPassword',
  })

  const onSubmit = form.handleSubmit(async (data) => {
    setSubmitting(true)
    try {
      await apis.auth.resetPassword({
        email,
        code,
        newPassword: data.newPassword,
      })
      onSuccess()
    } catch (e) {
      modal.error(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <View>
      <StepHeader
        Icon={CheckCircle2}
        title="Crie uma nova senha"
        subtitle="Mínimo 8 caracteres."
      />

      <FormProvider {...form}>
        <View style={{ marginTop: 24, gap: 16 }}>
          <FormInput
            name="newPassword"
            label="Nova senha"
            placeholder="Mínimo 8 caracteres"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            rightSlot={
              <Pressable
                onPress={() => setShow((v) => !v)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'}
                style={({ pressed }) => ({
                  padding: 8,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                {show ? (
                  <EyeOff size={18} color={MUTED} />
                ) : (
                  <Eye size={18} color={MUTED} />
                )}
              </Pressable>
            }
            rules={{
              required: 'Crie uma senha.',
              minLength: {
                value: 8,
                message: 'A senha precisa ter pelo menos 8 caracteres.',
              },
            }}
          />

          <FormInput
            ref={confirmPasswordRef}
            name="confirmPassword"
            label="Confirme a nova senha"
            placeholder="Repita a senha"
            secureTextEntry={!showConfirm}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => onSubmit()}
            rightSlot={
              <Pressable
                onPress={() => setShowConfirm((v) => !v)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  showConfirm ? 'Ocultar senha' : 'Mostrar senha'
                }
                style={({ pressed }) => ({
                  padding: 8,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                {showConfirm ? (
                  <EyeOff size={18} color={MUTED} />
                ) : (
                  <Eye size={18} color={MUTED} />
                )}
              </Pressable>
            }
            rules={{
              required: 'Confirme sua senha.',
              validate: (v: string) =>
                v === newPassword || 'As senhas não coincidem.',
            }}
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
          Salvar nova senha
        </Button>
      </View>
    </View>
  )
}
