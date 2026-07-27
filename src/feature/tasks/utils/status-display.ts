import type { TTaskStatus } from '@/apis/tasks/tasks-api-types'

/**
 * PT-BR label for a task status. Copy comes from the SPEC.
 */
export function statusLabel(status: TTaskStatus): string {
  switch (status) {
    case 'available':
      return 'Disponível'
    case 'accepted':
      return 'Aceita'
    case 'on_the_way':
      return 'A caminho'
    case 'in_progress':
      return 'Em andamento'
    case 'verification_required':
      return 'Aguardando validação'
    case 'completed':
      return 'Concluída'
    case 'canceled':
      return 'Cancelada'
    case 'payout_failed':
      return 'Pagamento pendente'
  }
}
