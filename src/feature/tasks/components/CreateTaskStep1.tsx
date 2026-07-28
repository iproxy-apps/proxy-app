import { MapPin } from 'lucide-react-native'
import { useRef } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { Pressable, Text, TextInput, View } from 'react-native'

import {
  ACCENT,
  ACCENT_TINT,
  BORDER,
  GRAPHITE,
  MUTED,
} from '@/common/theme/colors'
import {
  maskBRL,
  maskCEP,
  maskState,
  parseBRLToNumber,
} from '@/common/utils/masks'
import { modal } from '@/lib/modal'
import { Button } from '@/shared/components/Button'
import { FormInput } from '@/shared/components/form/FormInput'

export type Step1FormData = {
  title: string
  description: string
  street: string
  city: string
  state: string
  zipCode: string
  /** BRL-masked string, e.g. "R$ 30,00". Use parseBRLToNumber before sending. */
  offeredPrice: string
}

type Props = {
  defaultValues?: Partial<Step1FormData>
  onSubmit: (data: Step1FormData) => void
}

export function CreateTaskStep1({ defaultValues, onSubmit }: Props) {
  const form = useForm<Step1FormData>({
    mode: 'all',
    defaultValues: {
      title: '',
      description: '',
      street: '',
      city: '',
      state: '',
      zipCode: '',
      offeredPrice: '',
      ...defaultValues,
    },
  })
  const { isValid } = form.formState

  const descriptionRef = useRef<TextInput>(null)
  const streetRef = useRef<TextInput>(null)
  const cityRef = useRef<TextInput>(null)
  const stateRef = useRef<TextInput>(null)
  const zipCodeRef = useRef<TextInput>(null)
  const priceRef = useRef<TextInput>(null)

  const handleUseLocation = () => {
    // TODO(milestone 3.c): swap for useLocationCapture
    modal.info(
      'Em breve esse botão vai preencher o endereço automaticamente usando sua localização.',
    )
  }

  const submit = form.handleSubmit((data) => {
    onSubmit({
      title: data.title.trim(),
      description: data.description.trim(),
      street: data.street.trim(),
      city: data.city.trim(),
      state: data.state.trim().toUpperCase(),
      zipCode: data.zipCode.trim(),
      offeredPrice: data.offeredPrice,
    })
  })

  return (
    <View>
      <Text
        style={{
          fontSize: 26,
          fontWeight: '700',
          color: GRAPHITE,
          letterSpacing: -0.4,
          lineHeight: 32,
        }}
      >
        Detalhes da tarefa
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 14,
          color: MUTED,
          lineHeight: 20,
        }}
      >
        Seja claro sobre o que você precisa — quanto mais detalhe, melhor o Proxy
        entende o serviço.
      </Text>

      <FormProvider {...form}>
        <View style={{ marginTop: 24, gap: 16 }}>
          <FormInput
            name="title"
            label="Título"
            placeholder="Ex: Trocar lâmpada da sala"
            autoCapitalize="sentences"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => descriptionRef.current?.focus()}
            rules={{ required: 'Informe um título.' }}
          />

          <FormInput
            ref={descriptionRef}
            name="description"
            label="Descrição"
            placeholder="Conte tudo que importa pro Proxy entender o serviço."
            multiline
            autoCapitalize="sentences"
            returnKeyType="default"
            rules={{
              required: 'Descreva a tarefa.',
              minLength: {
                value: 10,
                message: 'Mínimo 10 caracteres.',
              },
            }}
            hint="Mínimo 10 caracteres."
          />
        </View>

        <View style={{ marginTop: 28 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: GRAPHITE,
              letterSpacing: -0.2,
              marginBottom: 12,
            }}
          >
            Endereço
          </Text>

          <Pressable
            onPress={handleUseLocation}
            accessibilityRole="button"
            accessibilityLabel="Usar minha localização"
          >
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: ACCENT_TINT,
                  borderWidth: 1,
                  borderColor: BORDER,
                  marginBottom: 16,
                  opacity: pressed ? 0.75 : 1,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    backgroundColor: 'white',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <MapPin size={16} color={ACCENT} />
                </View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: GRAPHITE,
                    flex: 1,
                  }}
                >
                  Usar minha localização
                </Text>
              </View>
            )}
          </Pressable>

          <View style={{ gap: 16 }}>
            <FormInput
              ref={streetRef}
              name="street"
              label="Rua, número e bairro"
              placeholder="Ex: Rua das Flores, 123 — Centro"
              autoCapitalize="sentences"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => cityRef.current?.focus()}
              rules={{ required: 'Informe o endereço.' }}
            />

            <FormInput
              ref={cityRef}
              name="city"
              label="Cidade"
              placeholder="Ex: São Paulo"
              autoCapitalize="words"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => stateRef.current?.focus()}
              rules={{ required: 'Informe a cidade.' }}
            />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 96 }}>
                <FormInput
                  ref={stateRef}
                  name="state"
                  label="Estado"
                  placeholder="SP"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => zipCodeRef.current?.focus()}
                  format={maskState}
                  rules={{
                    required: 'UF',
                    minLength: { value: 2, message: 'UF' },
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormInput
                  ref={zipCodeRef}
                  name="zipCode"
                  label="CEP"
                  placeholder="00000-000"
                  keyboardType="number-pad"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => priceRef.current?.focus()}
                  format={maskCEP}
                  rules={{
                    required: 'Informe o CEP.',
                    minLength: { value: 9, message: 'CEP incompleto.' },
                  }}
                />
              </View>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 28 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: GRAPHITE,
              letterSpacing: -0.2,
              marginBottom: 12,
            }}
          >
            Valor
          </Text>
          <FormInput
            ref={priceRef}
            name="offeredPrice"
            placeholder="R$ 0,00"
            keyboardType="number-pad"
            returnKeyType="go"
            onSubmitEditing={() => submit()}
            format={maskBRL}
            rules={{
              required: 'Informe o valor.',
              validate: (v: string) =>
                parseBRLToNumber(v) >= 10 || 'Mínimo R$ 10,00.',
            }}
            hint="Mínimo R$ 10,00. Você paga apenas quando o Proxy entrega."
          />
        </View>
      </FormProvider>

      <View style={{ flex: 1 }} />

      <View style={{ marginTop: 32 }}>
        <Button
          variant="primary"
          size="xl"
          fullWidth
          disabled={!isValid}
          onPress={submit}
        >
          Continuar
        </Button>
      </View>
    </View>
  )
}
