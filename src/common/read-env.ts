export type AppEnv = { apiUrl: string; stripePublishableKey: string }
export type RawEnv = {
  EXPO_PUBLIC_API_URL?: string
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string
}

export const STRIPE_KEY_PLACEHOLDER = 'pk_test_xxx'

export class EnvError extends Error {}

function readApiUrl(value: string | undefined): {
  value?: string
  reason?: string
} {
  if (!value) return { reason: 'missing' }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { reason: 'not an http(s) URL' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { reason: 'not an http(s) URL' }
  }
  return { value: value.replace(/\/+$/, '') }
}

function readStripeKey(value: string | undefined): {
  value?: string
  reason?: string
} {
  if (!value) return { reason: 'missing' }
  if (value === STRIPE_KEY_PLACEHOLDER) return { reason: 'placeholder value' }
  if (!value.startsWith('pk_test_') && !value.startsWith('pk_live_')) {
    return { reason: 'not a publishable key' }
  }
  return { value }
}

export function readEnv(raw: RawEnv): AppEnv {
  const api = readApiUrl(raw.EXPO_PUBLIC_API_URL)
  const stripe = readStripeKey(raw.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY)

  const failures: string[] = []
  if (api.reason) failures.push(`EXPO_PUBLIC_API_URL (${api.reason})`)
  if (stripe.reason)
    failures.push(`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (${stripe.reason})`)
  if (failures.length > 0 || !api.value || !stripe.value) {
    throw new EnvError(`Invalid app configuration: ${failures.join(', ')}`)
  }

  return { apiUrl: api.value, stripePublishableKey: stripe.value }
}
