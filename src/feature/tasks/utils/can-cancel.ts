import type { TTaskStatus } from '@/apis/tasks/tasks-api-types'

const ONE_HOUR_MS = 60 * 60 * 1000

/**
 * Whether the client can still cancel the task, per SPEC §8.9:
 * - `available`: always
 * - `in_progress`: only within the first hour after startedAt
 * - anything else: no
 *
 * `now` is injected so callers can pass Date.now() and stay pure.
 */
export function canCancelTask(
  task: { status: TTaskStatus; startedAt: string | null },
  now: number = Date.now(),
): boolean {
  if (task.status === 'available') return true
  if (task.status === 'in_progress') {
    if (!task.startedAt) return true
    const elapsed = now - new Date(task.startedAt).getTime()
    return elapsed < ONE_HOUR_MS
  }
  return false
}
