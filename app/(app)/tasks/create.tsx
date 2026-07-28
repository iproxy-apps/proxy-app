import { router } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { BG, BORDER, GRAPHITE, MUTED } from '@/common/theme/colors'
import {
  CreateTaskStep1,
  type Step1FormData,
} from '@/feature/tasks/components/CreateTaskStep1'
import { ScreenHeader } from '@/shared/components/ScreenHeader'

type Step = 1 | 2

export default function CreateTask() {
  const [step, setStep] = useState<Step>(1)
  const [step1Data, setStep1Data] = useState<Step1FormData | null>(null)

  const handleBack = () => {
    if (step === 1) {
      router.back()
    } else {
      setStep(1)
    }
  }

  const handleStep1Submit = (data: Step1FormData) => {
    setStep1Data(data)
    setStep(2)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <ScreenHeader title="Nova tarefa" onBack={handleBack} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          <ProgressBar current={step} total={2} />

          {step === 1 && (
            <CreateTaskStep1
              defaultValues={step1Data ?? undefined}
              onSubmit={handleStep1Submit}
            />
          )}
          {step === 2 && <Step2Placeholder />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

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

function Step2Placeholder() {
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
        Pagamento
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 14,
          color: MUTED,
          lineHeight: 20,
        }}
      >
        Passo 2 de 2 — em breve o resumo, o seletor de cartão e o breakdown de
        taxas aparecerão aqui.
      </Text>

      <View style={{ flex: 1 }} />
    </View>
  )
}
