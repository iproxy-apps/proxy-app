import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { BG, BORDER, GRAPHITE } from '@/common/theme/colors'
import {
  CreateTaskStep1,
  type Step1Submit,
} from '@/feature/tasks/components/CreateTaskStep1'
import { CreateTaskStep2 } from '@/feature/tasks/components/CreateTaskStep2'
import { ScreenHeader } from '@/shared/components/ScreenHeader'

type Step = 1 | 2

export default function CreateTask() {
  const [step, setStep] = useState<Step>(1)
  const [draft, setDraft] = useState<Step1Submit | null>(null)

  const handleBack = () => {
    if (step === 1) {
      router.back()
    } else {
      setStep(1)
    }
  }

  const handleStep1Submit = (data: Step1Submit) => {
    setDraft(data)
    setStep(2)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <Stack.Screen options={{ gestureEnabled: true }} />
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
              defaultValues={draft ?? undefined}
              initialCoords={
                draft
                  ? { lat: draft.locationLat, lng: draft.locationLng }
                  : null
              }
              onSubmit={handleStep1Submit}
            />
          )}
          {step === 2 && draft && <CreateTaskStep2 draft={draft} />}
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

