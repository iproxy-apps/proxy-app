import { Check } from 'lucide-react-native'
import { Text, View } from 'react-native'

import type { TTaskStatus } from '@/apis/tasks/tasks-api-types'
import {
  ACCENT,
  BORDER,
  DESTRUCTIVE,
  DESTRUCTIVE_TINT,
  GRAPHITE,
  MUTED,
  SUBTLE,
  SUCCESS,
} from '@/common/theme/colors'

type Props = {
  status: TTaskStatus
}

/**
 * Vertical 4-step stepper mapping the semantic task lifecycle. We skip the
 * enum-only states `accepted` / `on_the_way` (per SPEC §7.2 UI ignores them).
 * `canceled` doesn't fit a linear timeline and is rendered as a standalone
 * badge instead of a step.
 */
export function TaskTimeline({ status }: Props) {
  if (status === 'canceled') return <CanceledBadge />

  const currentIndex = STEP_ORDER.indexOf(mapToStep(status))

  return (
    <View>
      {STEPS.map((step, i) => {
        const state: StepState =
          i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo'
        return (
          <Step
            key={step.key}
            label={step.label}
            hint={step.hint}
            state={state}
            isLast={i === STEPS.length - 1}
          />
        )
      })}
    </View>
  )
}

// -----------------------------------------------------------------------------
// Steps
// -----------------------------------------------------------------------------

type StepKey = 'published' | 'in_progress' | 'awaiting' | 'completed'
type StepState = 'done' | 'current' | 'todo'

const STEPS: { key: StepKey; label: string; hint: string }[] = [
  {
    key: 'published',
    label: 'Publicada',
    hint: 'Aguardando um Proxy aceitar.',
  },
  {
    key: 'in_progress',
    label: 'Em andamento',
    hint: 'O Proxy está executando.',
  },
  {
    key: 'awaiting',
    label: 'Aguardando validação',
    hint: 'O Proxy enviou a prova, aguardando o cliente validar.',
  },
  { key: 'completed', label: 'Concluída', hint: 'Pagamento liberado.' },
]

const STEP_ORDER: StepKey[] = STEPS.map((s) => s.key)

function mapToStep(status: TTaskStatus): StepKey {
  switch (status) {
    case 'available':
      return 'published'
    case 'accepted':
    case 'on_the_way':
    case 'in_progress':
      return 'in_progress'
    case 'verification_required':
      return 'awaiting'
    case 'completed':
    case 'payout_failed':
      return 'completed'
    case 'canceled':
      // Handled separately via CanceledBadge — shouldn't reach here.
      return 'published'
  }
}

// -----------------------------------------------------------------------------
// Row
// -----------------------------------------------------------------------------

type StepProps = {
  label: string
  hint: string
  state: StepState
  isLast: boolean
}

function Step({ label, hint, state, isLast }: StepProps) {
  const isDone = state === 'done'
  const isCurrent = state === 'current'

  const nodeBg = isDone ? SUCCESS : isCurrent ? ACCENT : 'white'
  const nodeBorder = isDone ? SUCCESS : isCurrent ? ACCENT : BORDER
  const labelColor = state === 'todo' ? SUBTLE : GRAPHITE
  const hintColor = state === 'todo' ? SUBTLE : MUTED

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      {/* Rail column */}
      <View style={{ width: 28, alignItems: 'center' }}>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: nodeBg,
            borderWidth: 2,
            borderColor: nodeBorder,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isDone ? <Check size={12} color="white" strokeWidth={3} /> : null}
        </View>
        {!isLast ? (
          <View
            style={{
              flex: 1,
              width: 2,
              backgroundColor: isDone ? SUCCESS : BORDER,
              marginTop: 2,
            }}
          />
        ) : null}
      </View>

      {/* Text column */}
      <View style={{ flex: 1, marginLeft: 12, paddingBottom: isLast ? 0 : 18 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '700',
            color: labelColor,
            letterSpacing: -0.2,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            marginTop: 2,
            fontSize: 12,
            color: hintColor,
            lineHeight: 17,
          }}
        >
          {hint}
        </Text>
      </View>
    </View>
  )
}

function CanceledBadge() {
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 12,
        backgroundColor: DESTRUCTIVE_TINT,
        borderWidth: 1,
        borderColor: DESTRUCTIVE_TINT,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: '700',
          color: DESTRUCTIVE,
          letterSpacing: -0.1,
        }}
      >
        Tarefa cancelada
      </Text>
      <Text
        style={{ marginTop: 4, fontSize: 12, color: MUTED, lineHeight: 17 }}
      >
        Se um pagamento tinha sido pré-autorizado, ele foi estornado.
      </Text>
    </View>
  )
}
