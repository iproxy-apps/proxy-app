/**
 * Central registry of React Query keys.
 *
 * Every query/mutation hook in `apis/*` must import its key from here so we
 * have a single source of truth for cache invalidation.
 */
export const queryKeys = {
  card: ['card'] as const,
  tasksActive: ['tasks', 'active'] as const,
}
