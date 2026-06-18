import { api } from './client'
import type {
  CreateAccountPayload,
  CreateCardPayload,
  ForgotPasswordPayload,
  ResetPasswordPayload,
  SessionResponse,
  SignInPayload,
  VerifyResetCodePayload,
} from './types'
import type { Card } from '../../types/card'

/**
 * Typed route map. Each function corresponds to a single backend endpoint.
 * Grouped by module to mirror the backend layout (auth, tasks, cards, ...).
 */
export const apis = {
  auth: {
    create: (payload: CreateAccountPayload) =>
      api.post<SessionResponse>('/auth/create', payload).then((r) => r.data),

    session: (payload: SignInPayload) =>
      api.post<SessionResponse>('/auth/session', payload).then((r) => r.data),

    forgotPassword: (payload: ForgotPasswordPayload) =>
      api.post<{ message: string }>('/auth/forgot-password', payload).then((r) => r.data),

    verifyResetCode: (payload: VerifyResetCodePayload) =>
      api.post<{ message: string }>('/auth/verify-reset-code', payload).then((r) => r.data),

    resetPassword: (payload: ResetPasswordPayload) =>
      api.post<{ message: string }>('/auth/reset-password', payload).then((r) => r.data),
  },

  cards: {
    fetch: () => api.get<Card>('/card/fetch').then((r) => r.data),

    create: (payload: CreateCardPayload) =>
      api.post<Card>('/card/create', payload).then((r) => r.data),

    delete: (id: string) =>
      api.delete<{ message: string }>(`/card/${id}`).then((r) => r.data),
  },
}
