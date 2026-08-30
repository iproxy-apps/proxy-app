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
// Payment
// -----------------------------------------------------------------------------

export type TPaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'disputed'

export interface TPayment {
  id: string
  taskId: string
  amount: string
  status: TPaymentStatus
  paymentIntent: string
  refundId: string | null
  createdAt: string
  updatedAt: string
}

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

/**
 * Task as returned by GET /tasks/:id — same as TTask plus the embedded
 * payment record when one exists. The list endpoints (/tasks/active,
 * /tasks/fetch) do NOT include payment.
 */
export type TTaskDetail = TTask & {
  payment: TPayment | null
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

export interface TCancelTaskPayload {
  taskId: string
}

export interface TValidateTaskPayload {
  taskId: string
  rating?: number
  comment?: string
}

export interface TStartTaskPayload {
  taskId: string
}

// -----------------------------------------------------------------------------
// Responses
// -----------------------------------------------------------------------------

export interface TCreateTaskResponse {
  id: string
}

export type TStartTaskResult =
  | { status: 'succeeded' }
  | { status: 'requires_action'; clientSecret: string | null }
