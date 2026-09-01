import * as ImagePicker from 'expo-image-picker'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { Camera, ImageIcon } from 'lucide-react-native'
import { useState } from 'react'
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { extractErrorMessage } from '@/apis/api-client'
import { useFinishTaskMutation } from '@/apis/tasks/tasks-hooks'
import {
  ACCENT_TINT_STRONG,
  BG,
  BORDER,
  GRAPHITE,
  MUTED,
  SUBTLE,
} from '@/common/theme/colors'
import { modal } from '@/lib/modal'
import { toast } from '@/lib/toast'
import { Button } from '@/shared/components/Button'
import { ScreenHeader } from '@/shared/components/ScreenHeader'

type PickedImage = {
  uri: string
  name: string
  type: string
}

export default function FinishTask() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const finishTask = useFinishTaskMutation()

  const [picked, setPicked] = useState<PickedImage | null>(null)

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(
        'Permissão necessária',
        'Habilite o acesso às fotos nas configurações do seu iPhone.',
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      selectionLimit: 1,
      quality: 0.7,
    })
    handlePickResult(result)
  }

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(
        'Permissão necessária',
        'Habilite o acesso à câmera nas configurações do seu iPhone.',
      )
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
    })
    handlePickResult(result)
  }

  const handlePickResult = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) return
    const asset = result.assets[0]
    const type = asset.mimeType ?? 'image/jpeg'
    const name = asset.fileName ?? `proof-${Date.now()}.${extFromMime(type)}`
    setPicked({ uri: asset.uri, name, type })
  }

  const submit = async () => {
    if (!picked || !id) return
    try {
      await finishTask.mutateAsync({ taskId: id, file: picked })
      toast.success('Comprovante enviado. Aguardando validação.')
      router.back()
    } catch (e) {
      modal.error(extractErrorMessage(e))
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <Stack.Screen options={{ gestureEnabled: true }} />
      <ScreenHeader title="Enviar comprovante" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            marginTop: 8,
            fontSize: 22,
            fontWeight: '700',
            color: GRAPHITE,
            letterSpacing: -0.4,
            lineHeight: 28,
          }}
        >
          Registre o comprovante
        </Text>
        <Text
          style={{
            marginTop: 8,
            fontSize: 14,
            color: MUTED,
            lineHeight: 20,
          }}
        >
          Uma foto mostrando que a tarefa foi concluída. O cliente vai revisar
          antes de liberar o pagamento.
        </Text>

        {picked ? (
          <View style={{ marginTop: 28 }}>
            <PreviewCard uri={picked.uri} onReplace={() => setPicked(null)} />
          </View>
        ) : (
          <View style={{ marginTop: 28, gap: 10 }}>
            <OptionRow
              icon={<Camera size={22} color={GRAPHITE} />}
              title="Tirar foto"
              subtitle="Usar a câmera agora"
              onPress={pickFromCamera}
            />
            <OptionRow
              icon={<ImageIcon size={22} color={GRAPHITE} />}
              title="Escolher da biblioteca"
              subtitle="Selecionar uma foto existente"
              onPress={pickFromLibrary}
            />
          </View>
        )}

        <View style={{ flex: 1 }} />

        <View style={{ marginTop: 24, marginBottom: insets.bottom }}>
          <Button
            variant="primary"
            size="xl"
            fullWidth
            disabled={!picked}
            loading={finishTask.isPending}
            onPress={submit}
          >
            Enviar e concluir tarefa
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// -----------------------------------------------------------------------------
// Option row — icon-left + title/subtitle left-aligned. Extensible: more rows
// (Google Drive, compartilhar link, etc.) can be added below with no layout
// change.
// -----------------------------------------------------------------------------

type OptionRowProps = {
  icon: React.ReactNode
  title: string
  subtitle: string
  onPress: () => void
}

function OptionRow({ icon, title, subtitle, onPress }: OptionRowProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 16,
            borderRadius: 16,
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: BORDER,
            opacity: pressed ? 0.7 : 1,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              backgroundColor: ACCENT_TINT_STRONG,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 14,
            }}
          >
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: GRAPHITE,
                letterSpacing: -0.2,
              }}
            >
              {title}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 12, color: SUBTLE }}>
              {subtitle}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  )
}

// -----------------------------------------------------------------------------
// Preview
// -----------------------------------------------------------------------------

function PreviewCard({
  uri,
  onReplace,
}: {
  uri: string
  onReplace: () => void
}) {
  return (
    <View>
      <View
        style={{
          borderRadius: 20,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: BORDER,
          backgroundColor: 'white',
          height: 320,
        }}
      >
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </View>

      <View style={{ marginTop: 14 }}>
        <Button variant="outline" size="lg" fullWidth onPress={onReplace}>
          Trocar foto
        </Button>
      </View>
    </View>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('heic')) return 'heic'
  return 'jpg'
}
