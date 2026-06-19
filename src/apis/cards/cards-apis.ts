import { api } from '../api-client'
import type { TCard, TCreateCardPayload } from './cards-api-types'

export const cardsApis = {
  fetch: () => api.get<TCard>('/card/fetch').then((r) => r.data),

  create: (payload: TCreateCardPayload) =>
    api.post<TCard>('/card/create', payload).then((r) => r.data),

  delete: (id: string) =>
    api.delete<{ message: string }>(`/card/${id}`).then((r) => r.data),
}
