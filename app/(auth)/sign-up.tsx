import { useLocalSearchParams } from 'expo-router'
import { Camera, CheckCircle2, Eye, EyeOff } from 'lucide-react-native'
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

import { Button } from '@/shared/components/Button'
import { FormCheckbox } from '@/shared/components/form/FormCheckbox'
import { FormInput } from '@/shared/components/form/FormInput'
import { FormToggle } from '@/shared/components/form/FormToggle'
import { ScreenHeader } from '@/shared/components/ScreenHeader'
import { useProxyAuth } from '@/feature/auth/hooks/useProxyAuth'
import { extractErrorMessage } from '@/apis/api-client'
import { maskDocument, maskPhone, unmask } from '@/common/utils/masks'
import { modal } from '../../src/lib/modal'
import type { TUserType } from '@/apis/auth/auth-api-types'

import { BG, GRAPHITE, MUTED, SUCCESS } from '@/common/theme/colors'

type SignUpFormData = {
  name: string
  email: string
  phoneNumber: string
  password: string
  documentType: 'CPF' | 'CNPJ'
  document: string
  termsAccepted: boolean
}

export default function SignUp() {
  const { userType: userTypeParam } = useLocalSearchParams<{
    userType?: TUserType
  }>()
  const userType: TUserType = userTypeParam === 'PROXY' ? 'PROXY' : 'CLIENT'
  const isProxy = userType === 'PROXY'

  const { signUp } = useProxyAuth()
  const [photoUploaded, setPhotoUploaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const emailRef = useRef<TextInput>(null)
  const phoneRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)
  const documentRef = useRef<TextInput>(null)

  const form = useForm<SignUpFormData>({
    mode: 'all',
    defaultValues: {
      name: '',
      email: '',
      phoneNumber: '',
      password: '',
      documentType: 'CPF',
      document: '',
      termsAccepted: false,
    },
  })

  const documentType = useWatch({
    control: form.control,
    name: 'documentType',
  })

  const { isValid } = form.formState
  const canSubmit = isValid && (!isProxy || photoUploaded)

  const onSubmit = form.handleSubmit(async (data) => {
    if (isProxy && !photoUploaded) {
      modal.error('Envie a foto do seu documento.')
      return
    }

    setSubmitting(true)
    try {
      await signUp({
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        phoneNumber: unmask(data.phoneNumber),
        password: data.password,
        userType,
        documentType: data.documentType,
        termsAccepted: true,
      })
    } catch (e) {
      modal.error(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <ScreenHeader title="Criar conta" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 24,
            paddingBottom: 24,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Badge perfil */}
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: 'hsl(40, 15%, 94%)',
              marginTop: 8,
            }}
          >
            <Text style={{ fontSize: 12, color: MUTED }}>
              Cadastrando como
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: GRAPHITE }}>
              {isProxy ? 'Proxy' : 'Cliente'}
            </Text>
          </View>

          <FormProvider {...form}>
            <View style={{ marginTop: 20, gap: 16 }}>
              <FormInput
                name="name"
                label="Nome completo"
                placeholder="Seu nome"
                autoCapitalize="words"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => emailRef.current?.focus()}
                rules={{
                  required: 'Informe seu nome.',
                  minLength: { value: 2, message: 'Nome muito curto.' },
                }}
              />

              <FormInput
                ref={emailRef}
                name="email"
                label="Email"
                placeholder="voce@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => phoneRef.current?.focus()}
                rules={{
                  required: 'Informe seu email.',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Email inválido.',
                  },
                }}
              />

              <FormInput
                ref={phoneRef}
                name="phoneNumber"
                label="Telefone"
                placeholder="(11) 99999-0000"
                keyboardType="phone-pad"
                format={maskPhone}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordRef.current?.focus()}
                rules={{
                  required: 'Informe seu telefone.',
                  validate: (v: string) =>
                    unmask(v).length >= 10 || 'Telefone incompleto.',
                }}
              />

              <FormInput
                ref={passwordRef}
                name="password"
                label="Senha"
                placeholder="Mínimo 8 caracteres"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => documentRef.current?.focus()}
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
                rules={{
                  required: 'Crie uma senha.',
                  minLength: {
                    value: 8,
                    message: 'A senha precisa ter pelo menos 8 caracteres.',
                  },
                }}
              />

              <View style={{ gap: 8 }}>
                <FormToggle<'CPF' | 'CNPJ'>
                  name="documentType"
                  label="Tipo de documento"
                  options={[
                    { value: 'CPF', label: 'CPF' },
                    { value: 'CNPJ', label: 'CNPJ' },
                  ]}
                  rules={{ required: 'Selecione o tipo.' }}
                />

                <FormInput
                  ref={documentRef}
                  name="document"
                  placeholder={
                    documentType === 'CNPJ'
                      ? '00.000.000/0000-00'
                      : '000.000.000-00'
                  }
                  keyboardType="number-pad"
                  format={(v) => maskDocument(v, documentType)}
                  returnKeyType="go"
                  onSubmitEditing={() => onSubmit()}
                  rules={{
                    required: 'Informe seu documento.',
                    validate: (v: string) => {
                      const len = unmask(v).length
                      if (documentType === 'CPF') {
                        return len === 11 || 'CPF incompleto.'
                      }
                      return len === 14 || 'CNPJ incompleto.'
                    },
                  }}
                />
              </View>

              {isProxy ? (
                <PhotoUploader
                  uploaded={photoUploaded}
                  onPress={() => setPhotoUploaded((v) => !v)}
                />
              ) : null}

              <FormCheckbox
                name="termsAccepted"
                style={{ marginTop: 4 }}
                rules={{ required: 'Aceite os termos para continuar.' }}
                label={
                  <Text style={{ fontSize: 13, color: GRAPHITE, lineHeight: 18 }}>
                    Li e aceito os{' '}
                    <Text style={{ fontWeight: '700' }}>Termos de Uso</Text> e a{' '}
                    <Text style={{ fontWeight: '700' }}>
                      Política de Privacidade
                    </Text>
                    .
                  </Text>
                }
              />
            </View>
          </FormProvider>

          <View style={{ flex: 1 }} />

          <View style={{ marginTop: 24 }}>
            <Button
              variant="primary"
              size="xl"
              fullWidth
              loading={submitting}
              disabled={!canSubmit}
              onPress={onSubmit}
            >
              Criar minha conta
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

type PhotoUploaderProps = {
  uploaded: boolean
  onPress: () => void
}

function PhotoUploader({ uploaded, onPress }: PhotoUploaderProps) {
  return (
    <View>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: GRAPHITE,
          marginBottom: 6,
        }}
      >
        Foto do documento (frente)
      </Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => ({
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: uploaded ? SUCCESS : 'hsl(40, 10%, 80%)',
          backgroundColor: uploaded
            ? 'hsla(152, 60%, 38%, 0.06)'
            : 'hsl(40, 15%, 96%)',
          borderRadius: 12,
          paddingVertical: 24,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {uploaded ? (
          <>
            <CheckCircle2 size={28} color={SUCCESS} />
            <Text
              style={{
                marginTop: 8,
                fontSize: 14,
                fontWeight: '600',
                color: SUCCESS,
              }}
            >
              Documento enviado
            </Text>
            <Text style={{ marginTop: 2, fontSize: 12, color: MUTED }}>
              Toque pra trocar
            </Text>
          </>
        ) : (
          <>
            <Camera size={28} color={GRAPHITE} />
            <Text
              style={{
                marginTop: 8,
                fontSize: 14,
                fontWeight: '600',
                color: GRAPHITE,
              }}
            >
              Tirar foto
            </Text>
            <Text style={{ marginTop: 2, fontSize: 12, color: MUTED }}>
              JPG, PNG ou WEBP — até 10MB
            </Text>
          </>
        )}
      </Pressable>
      <Text style={{ marginTop: 6, fontSize: 11, color: MUTED }}>
        Necessário para ativar sua conta de Proxy.
      </Text>
    </View>
  )
}
