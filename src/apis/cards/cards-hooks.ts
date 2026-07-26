import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { queryKeys } from '../query-keys'
import { cardsApis } from './cards-apis'
import type { TCard } from './cards-api-types'

/**
 * Fetches the user's saved card. A 404 from the backend means "no card on
 * file" — we translate that into a resolved `null` value instead of an error
 * so screens can render the empty state.
 */
export function useCardQuery(options?: { enabled?: boolean }) {
  return useQuery<TCard | null>({
    queryKey: queryKeys.card,
    queryFn: async () => {
      try {
        return await cardsApis.fetch()
      } catch (e) {
        if (isAxiosError(e) && e.response?.status === 404) return null
        throw e
      }
    },
    enabled: options?.enabled,
  })
}

export function useCreateCardMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: cardsApis.create,
    onSuccess: (card) => {
      qc.setQueryData(queryKeys.card, card)
    },
  })
}

export function useDeleteCardMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: cardsApis.delete,
    onSuccess: () => {
      qc.setQueryData(queryKeys.card, null)
    },
  })
}
