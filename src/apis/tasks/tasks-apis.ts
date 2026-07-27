import { api } from '../api-client'
import type {
  TCreateTaskPayload,
  TCreateTaskResponse,
  TTask,
} from './tasks-api-types'

export const tasksApis = {
  fetchActive: () =>
    api.get<TTask[]>('/tasks/active').then((r) => r.data),

  create: (payload: TCreateTaskPayload) =>
    api.post<TCreateTaskResponse>('/tasks/create', payload).then((r) => r.data),
}
