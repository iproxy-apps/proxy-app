// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

export type TTaskStatus =
  | 'available'
  | 'accepted'
  | 'on_the_way'
  | 'in_progress'
  | 'verification_required'
  | 'completed'
  | 'canceled'
  | 'payout_failed'

/**
 * Statuses considered "active" — what the CLIENT sees on Home / what the
 * PROXY sees when they have an accepted or in-progress task. Backend already
 * filters GET /tasks/active to these, so the frontend does not need to filter
 * by status.
 */
export const ACTIVE_TASK_STATUSES: readonly TTaskStatus[] = [
  'accepted',
  'on_the_way',
  'in_progress',
  'verification_required',
] as const

// -----------------------------------------------------------------------------
// Entities
// -----------------------------------------------------------------------------

export interface TTaskOwner {
  id: string
  name: string
  email: string
  phoneNumber: string | null
  avatarUrl: string | null
  isVerified: boolean
  rating: string
  totalTasksCompleted: number
  totalTasksCreated: number
  stripeCustomerId: string | null
}

/**
 * Task as returned by GET /tasks/active. `Decimal` fields (money, coords) are
 * serialized as strings — use Number() or the formatBRL helper before math or
 * display.
 */
export interface TTask {
  id: string
  title: string
  description: string
  locationAddress: string
  locationLat: string
  locationLng: string
  offeredPrice: string
  proxyEarnings: string | null
  platformFee: string | null
  status: TTaskStatus
  createdAt: string
  startedAt: string | null
  owner: string
  ownerId: TTaskOwner
}

// -----------------------------------------------------------------------------
// Request payloads
// -----------------------------------------------------------------------------

export interface TCreateTaskPayload {
  title: string
  description: string
  address: {
    city: string
    state: string
    street: string
    zipCode: string
    locationLat: number
    locationLng: number
  }
  pricing: {
    offeredPrice: number
  }
  cardDetails:
    | { savedCard: string }
    | { token: string }
}

// -----------------------------------------------------------------------------
// Responses
// -----------------------------------------------------------------------------

export interface TCreateTaskResponse {
  id: string
}
