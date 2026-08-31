import type { ImageSourcePropType } from 'react-native'

/**
 * Builds an `<Image source>` for the authenticated GET /tasks/:id/proof
 * endpoint. React Native's Image component supports `headers` on the source,
 * which is how we ship the JWT without a public/static file endpoint.
 *
 * Returns null when the token is missing so the caller can render a placeholder
 * instead of a broken image.
 */
export function buildProofImageSource(
  taskId: string,
  token: string | null,
): ImageSourcePropType | null {
  const baseURL = process.env.EXPO_PUBLIC_API_URL
  if (!baseURL || !token) return null
  return {
    uri: `${baseURL}/tasks/${taskId}/proof`,
    headers: { Authorization: `Bearer ${token}` },
  }
}
