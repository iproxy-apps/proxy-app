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

/**
 * Cancels a task (Client action). Invalidates both the task detail and the
 * active-tasks list so the UI reflects the new `canceled` state everywhere.
 */
export function useCancelTaskMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tasksApis.cancel,
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.taskById(variables.taskId) })
      qc.invalidateQueries({ queryKey: queryKeys.tasksActive })
    },
  })
}

/**
 * Validates a completed task (Client action) — optionally with rating and
 * comment. Backend records the rating and transfers the payment. Invalidates
 * the detail + active list.
 */
export function useValidateTaskMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tasksApis.validate,
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.taskById(variables.taskId) })
      qc.invalidateQueries({ queryKey: queryKeys.tasksActive })
    },
  })
}

/**
 * Uploads the proof photo for an `in_progress` task and moves it to
 * `verification_required`. Multipart request — the mutation body is the same
 * `TFinishTaskPayload` shape (taskId + { uri, name, type }).
 */
export function useFinishTaskMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tasksApis.finish,
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.taskById(variables.taskId) })
      qc.invalidateQueries({ queryKey: queryKeys.tasksActive })
    },
  })
}

/**
 * Accepts an `available` task (Proxy action). Backend flips it to
 * `in_progress`, maps the executor, and charges the client's saved card.
 * Invalidates the detail, the executor's active list, and every city feed
 * (task no longer appears as available anywhere).
 */
export function useStartTaskMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: tasksApis.start,
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.taskById(variables.taskId) })
      qc.invalidateQueries({ queryKey: queryKeys.tasksActive })
      qc.invalidateQueries({ queryKey: ['tasks', 'byCity'] })
    },
  })
}
