import { type AppEnv, readEnv } from '@/common/read-env'

// Static EXPO_PUBLIC_* member access is required for Expo build-time inlining.
export const env: AppEnv = readEnv({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
})
