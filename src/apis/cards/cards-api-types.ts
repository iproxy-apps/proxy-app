// -----------------------------------------------------------------------------
// Entities
// -----------------------------------------------------------------------------

export interface TCard {
  id: string
  userId: string
  brand: string
  last4: string
  stripeCardId: string
}

// -----------------------------------------------------------------------------
// Request payloads
// -----------------------------------------------------------------------------

export interface TCreateCardPayload {
  token: string
}
