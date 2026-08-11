import { api } from '../api-client'
import type {
  TCancelTaskPayload,
  TCreateTaskPayload,
  TCreateTaskResponse,
  TTask,
  TTaskDetail,
  TValidateTaskPayload,
} from './tasks-api-types'

export const tasksApis = {
  fetchActive: () =>
    api.get<TTask[]>('/tasks/active').then((r) => r.data),

  fetchByCity: ({ city, page = 1 }: { city: string; page?: number }) =>
    api
      .get<TTask[]>('/tasks/fetch', { params: { city, page } })
      .then((r) => r.data),

  fetchById: (id: string) =>
    api.get<TTaskDetail>(`/tasks/${id}`).then((r) => r.data),

  create: (payload: TCreateTaskPayload) =>
    api.post<TCreateTaskResponse>('/tasks/create', payload).then((r) => r.data),

  cancel: (payload: TCancelTaskPayload) =>
    api.post<void>('/tasks/cancel', payload).then((r) => r.data),

  validate: (payload: TValidateTaskPayload) =>
    api.post<void>('/tasks/validate', payload).then((r) => r.data),
}
