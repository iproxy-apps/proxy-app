import { api } from '../api-client'
import type {
  TCreateAccountPayload,
  TForgotPasswordPayload,
  TResetPasswordPayload,
  TSessionResponse,
  TSignInPayload,
  TVerifyResetCodePayload,
} from './auth-api-types'

export const authApis = {
  create: (payload: TCreateAccountPayload) =>
    api.post<TSessionResponse>('/auth/create', payload).then((r) => r.data),

  session: (payload: TSignInPayload) =>
    api.post<TSessionResponse>('/auth/session', payload).then((r) => r.data),

  forgotPassword: (payload: TForgotPasswordPayload) =>
    api.post<{ message: string }>('/auth/forgot-password', payload).then((r) => r.data),

  verifyResetCode: (payload: TVerifyResetCodePayload) =>
    api.post<{ message: string }>('/auth/verify-reset-code', payload).then((r) => r.data),

  resetPassword: (payload: TResetPasswordPayload) =>
    api.post<{ message: string }>('/auth/reset-password', payload).then((r) => r.data),
}
