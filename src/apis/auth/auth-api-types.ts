// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

export type TUserType = 'CLIENT' | 'PROXY'
export type TDocumentType = 'RG' | 'CPF' | 'CNPJ'

// -----------------------------------------------------------------------------
// JWT session payload — what the backend embeds in the issued token.
// -----------------------------------------------------------------------------

export interface TSessionPayload {
  sub: string
  email: string
  name: string
  avatarUrl: string | null
  phoneNumber: string
  stripeAccountId: string | null
  stripeCustomerId: string | null
  userType: TUserType
  documentType: TDocumentType | null
  documentUrl: string | null
  isVerified: boolean
  rating: number
  totalTasksCompleted: number
  totalTasksCreated: number
  walletBalance: number
  termsAccepted: boolean
  iat?: number
  exp?: number
}

// -----------------------------------------------------------------------------
// Request payloads
// -----------------------------------------------------------------------------

export interface TCreateAccountPayload {
  name: string
  email: string
  password: string
  userType: TUserType
  phoneNumber?: string
  avatarUrl?: string
  documentType?: TDocumentType
  documentUrl?: string
  termsAccepted: boolean
}

export interface TSignInPayload {
  email: string
  password: string
}

export interface TForgotPasswordPayload {
  email: string
}

export interface TVerifyResetCodePayload {
  email: string
  code: string
}

export interface TResetPasswordPayload {
  email: string
  code: string
  newPassword: string
}

// -----------------------------------------------------------------------------
// Responses
// -----------------------------------------------------------------------------

export interface TSessionResponse {
  session: string
}

// -----------------------------------------------------------------------------
// Shared error envelope (returned by NestJS exception filter).
// -----------------------------------------------------------------------------

export interface TApiErrorBody {
  message: string
  errorCode?: string
  statusCode?: number
  path?: string
  timestamp?: string
}
