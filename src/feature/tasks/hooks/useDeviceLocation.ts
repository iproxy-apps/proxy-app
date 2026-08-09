import * as Location from 'expo-location'
import { useEffect, useState } from 'react'

export type DeviceLocationStatus =
  | 'idle'
  | 'loading'
  | 'granted'
  | 'denied'
  | 'error'

export type DevicePosition = { lat: number; lng: number }

/**
 * Reactively exposes the device's current position. Requests permission on
 * mount; if the user denies (or something else fails), `position` stays
 * `null` and consumers should gracefully hide any distance UI.
 *
 * One-shot: doesn't watch position updates. If we ever need live updates
 * (e.g., Proxy on the way), swap `getCurrentPositionAsync` for
 * `watchPositionAsync`.
 */
export function useDeviceLocation() {
  const [position, setPosition] = useState<DevicePosition | null>(null)
  const [status, setStatus] = useState<DeviceLocationStatus>('idle')

  useEffect(() => {
    let mounted = true
    void (async () => {
      setStatus('loading')
      try {
        const perm = await Location.requestForegroundPermissionsAsync()
        if (!mounted) return
        if (perm.status !== 'granted') {
          setStatus('denied')
          return
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        if (!mounted) return
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        setStatus('granted')
      } catch {
        if (mounted) setStatus('error')
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  return { position, status }
}
