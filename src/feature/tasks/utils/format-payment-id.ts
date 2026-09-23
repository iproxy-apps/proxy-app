/**
 * Shortens a Stripe PaymentIntent id for display on the receipt. Keeps the
 * `pi_` prefix and the last 8 chars, so `pi_3RxYz...abc12345` becomes
 * `pi_…abc12345`. Falls back to the full id when it is shorter than the tail.
 */
export function formatPaymentIntentId(id: string | null | undefined): string {
  if (!id) return '—'
  if (id.length <= 11) return id
  return `pi_…${id.slice(-8)}`
}
