import { EnvError, readEnv } from '@/common/read-env'

const valid = {
  EXPO_PUBLIC_API_URL: 'http://192.168.2.93:3333',
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_51abc',
}

describe('readEnv', () => {
  it('returns the parsed env for valid values', () => {
    expect(readEnv(valid)).toEqual({
      apiUrl: 'http://192.168.2.93:3333',
      stripePublishableKey: 'pk_test_51abc',
    })
  })

  it('strips a trailing slash from the API URL', () => {
    expect(
      readEnv({ ...valid, EXPO_PUBLIC_API_URL: 'https://api.proxy.app/' })
        .apiUrl,
    ).toBe('https://api.proxy.app')
  })

  it('throws when the API URL is missing', () => {
    expect(() => readEnv({ ...valid, EXPO_PUBLIC_API_URL: undefined })).toThrow(
      EnvError,
    )
    expect(() => readEnv({ ...valid, EXPO_PUBLIC_API_URL: '' })).toThrow(
      /EXPO_PUBLIC_API_URL \(missing\)/,
    )
  })

  it('throws when the API URL is not http(s)', () => {
    expect(() => readEnv({ ...valid, EXPO_PUBLIC_API_URL: 'ftp://x' })).toThrow(
      /not an http\(s\) URL/,
    )
  })

  it('throws for an empty Stripe key', () => {
    expect(() =>
      readEnv({ ...valid, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: '' }),
    ).toThrow(/EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY \(missing\)/)
  })

  it('throws for the committed placeholder key', () => {
    expect(() =>
      readEnv({ ...valid, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_xxx' }),
    ).toThrow(/placeholder value/)
  })

  it('throws for a secret key pasted by mistake', () => {
    expect(() =>
      readEnv({ ...valid, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'sk_test_123' }),
    ).toThrow(/not a publishable key/)
  })
})
