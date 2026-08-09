import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { queryKeys } from '../query-keys'
import { tasksApis } from './tasks-apis'

/** Matches the backend's fixed page size for /tasks/fetch (see SPEC §8.7). */
export const AVAILABLE_TASKS_PAGE_SIZE = 10

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

/**
 * Fetches a single task by id, including the embedded `payment` record.
 * Backend enforces ownership — a CLIENT gets 404 on someone else's task.
 */
export function useTaskByIdQuery(id: string | undefined) {
  return useQuery({
    queryKey: id ? queryKeys.taskById(id) : ['tasks', 'byId', 'unknown'],
    queryFn: () => tasksApis.fetchById(id as string),
    enabled: !!id,
  })
}

/**
 * Paginated feed of `available` tasks for a given city — the Proxy's job
 * board. Uses useInfiniteQuery so consumers can call fetchNextPage on scroll
 * end. Stops paginating when a page returns fewer than PAGE_SIZE items.
 */
export function useAvailableTasksInfiniteQuery(city: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.tasksByCity(city),
    queryFn: ({ pageParam }) =>
      tasksApis.fetchByCity({ city, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === AVAILABLE_TASKS_PAGE_SIZE
        ? allPages.length + 1
        : undefined,
  })
}

/**
 * Publishes a new task. On success, invalidates the active-tasks list so the
 * new task shows up on the Home Cliente without a manual refetch.
 */
export function useCreateTaskMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tasksApis.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tasksActive })
    },
  })
}
