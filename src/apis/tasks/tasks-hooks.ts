import { useQuery } from '@tanstack/react-query'

import { queryKeys } from '../query-keys'
import { tasksApis } from './tasks-apis'

/**
 * Fetches every active task involving the current user — tasks they OWN and
 * tasks they're EXECUTING. The Home Cliente further narrows to owned tasks
 * via `owner === user.id`; the Home Proxy (future) will do the inverse.
 */
export function useActiveTasksQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.tasksActive,
    queryFn: tasksApis.fetchActive,
    enabled: options?.enabled,
  })
}
