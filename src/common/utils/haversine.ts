type Coord = { lat: number; lng: number }

const EARTH_RADIUS_KM = 6371
const toRad = (n: number) => (n * Math.PI) / 180

/**
 * Great-circle distance between two lat/lng points, in kilometers.
 * Accurate enough for "how far is this task" — not for navigation.
 */
export function haversineKm(a: Coord, b: Coord): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * Formats a kilometer value for compact display: sub-1km rounds to meters,
 * 1-10km keeps a decimal, >=10km rounds to whole.
 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return ''
  if (km < 1) return `a ${Math.round(km * 1000)} m`
  if (km < 10) return `a ${km.toFixed(1).replace('.', ',')} km`
  return `a ${Math.round(km)} km`
}
