import { useMutation, useQuery } from '@tanstack/react-query'

import { queryKeys } from '../query-keys'
import { walletApis } from './wallet-apis'

export function useTransactionHistoryQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.transactionHistory,
    queryFn: walletApis.transactionHistory,
    enabled: options?.enabled,
  })
}

export function useCreateMerchantAccountMutation() {
  return useMutation({ mutationFn: walletApis.createMerchantAccount })
}

export function useMerchantDashboardMutation() {
  return useMutation({ mutationFn: walletApis.merchantDashboard })
}
