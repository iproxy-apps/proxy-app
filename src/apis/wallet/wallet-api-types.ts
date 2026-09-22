// -----------------------------------------------------------------------------
// Transaction history — mirrors the backend `TransactionHistoryTask` DTO with
// the `netAmount` field the completed list is enriched with.
// -----------------------------------------------------------------------------

export interface TTransactionHistoryTask {
  id: string
  title: string
  description: string
  offeredPrice: number
  status: string
  createdAt: string
  completedAt: string | null
}

export interface TCompletedTransactionTask extends TTransactionHistoryTask {
  netAmount: number
}

export interface TTransactionHistoryResponse {
  tasksCreated: TTransactionHistoryTask[]
  tasksCompleted: TCompletedTransactionTask[]
}

// -----------------------------------------------------------------------------
// Stripe Connect merchant account
// -----------------------------------------------------------------------------

export interface TMerchantAccountResponse {
  stripeAccountId?: string
  accountLinkUrl?: string
}

export interface TMerchantDashboardResponse {
  dashboardUrl: string
}
