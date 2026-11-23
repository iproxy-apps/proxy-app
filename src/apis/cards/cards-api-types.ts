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
  paymentMethodId: string
}

export interface TSetupIntent {
  clientSecret: string
  setupIntentId: string
}
