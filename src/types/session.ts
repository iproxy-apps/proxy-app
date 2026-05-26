export type UserType = 'CLIENT' | 'PROXY'
export type DocumentType = 'RG' | 'CPF' | 'CNPJ'

export interface SessionPayload {
  sub: string
  email: string
  name: string
  avatarUrl: string | null
  phoneNumber: string
  stripeAccountId: string | null
  stripeCustomerId: string | null
  userType: UserType
  documentType: DocumentType | null
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
