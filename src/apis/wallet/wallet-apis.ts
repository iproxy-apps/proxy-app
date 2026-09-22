import { api } from '../api-client'
import type {
  TMerchantAccountResponse,
  TMerchantDashboardResponse,
  TTransactionHistoryResponse,
} from './wallet-api-types'

export const walletApis = {
  transactionHistory: () =>
    api
      .get<TTransactionHistoryResponse>('/auth/transaction-history')
      .then((r) => r.data),

  createMerchantAccount: () =>
    api
      .post<TMerchantAccountResponse>('/auth/merchant-account')
      .then((r) => r.data),

  merchantDashboard: () =>
    api
      .get<TMerchantDashboardResponse>('/auth/merchant-dashboard')
      .then((r) => r.data),
}
