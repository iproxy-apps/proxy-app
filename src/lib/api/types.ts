import type { DocumentType, UserType } from '../../types/session'

export interface SessionResponse {
  session: string
}

export interface CreateAccountPayload {
  name: string
  email: string
  password: string
  userType: UserType
  phoneNumber?: string
  avatarUrl?: string
  documentType?: DocumentType
  documentUrl?: string
  termsAccepted: boolean
}

export interface SignInPayload {
  email: string
  password: string
}

export interface ForgotPasswordPayload {
  email: string
}

export interface VerifyResetCodePayload {
  email: string
  code: string
}

export interface ResetPasswordPayload {
  email: string
  code: string
  newPassword: string
}

export interface ApiErrorBody {
  message: string
  errorCode?: string
  statusCode?: number
  path?: string
  timestamp?: string
}
