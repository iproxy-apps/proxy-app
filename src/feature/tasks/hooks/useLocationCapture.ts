import * as Location from 'expo-location'
import { useState } from 'react'

import { extractErrorMessage } from '@/apis/api-client'
import { maskCEP } from '@/common/utils/masks'
import { modal } from '@/lib/modal'

// -----------------------------------------------------------------------------
// Brazilian state name → 2-letter abbreviation. Apple's reverse geocode returns
// the full name (e.g. "São Paulo") in `region`, but the API expects "SP".
// If the input is already 2 chars we return it as-is.
// -----------------------------------------------------------------------------

const STATE_ABBREVIATIONS: Record<string, string> = {
  acre: 'AC',
  alagoas: 'AL',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  goias: 'GO',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  para: 'PA',
  paraiba: 'PB',
  parana: 'PR',
  pernambuco: 'PE',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
}

function normalizeStateAbbr(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (trimmed.length === 2) return trimmed.toUpperCase()
  const key = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return STATE_ABBREVIATIONS[key] ?? ''
}

function buildStreet(
  street: string | null | undefined,
  streetNumber: string | null | undefined,
  district: string | null | undefined,
): string {
  const withNumber = [street, streetNumber].filter(Boolean).join(', ')
  return district ? `${withNumber} — ${district}` : withNumber
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type CapturedAddress = {
  street: string
  city: string
  state: string
  zipCode: string
  lat: number
  lng: number
}

export type ResolveCoordsInput = {
  street: string
  city: string
  state: string
  zipCode: string
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

/**
 * Owns the geolocation flow for task creation.
 *
 * `capture()` — user tapped "Usar minha localização". Requests permission,
 * fetches current position, reverse-geocodes to fill the address fields.
 *
 * `resolveCoords(address)` — called at submit when the user did NOT press the
 * location button. Tries `geocodeAsync` on the typed address (A2 in our plan);
 * if that fails, falls back to the device's current position (A1). Only
 * throws / returns null if BOTH strategies fail.
 */
export function useLocationCapture() {
  const [capturing, setCapturing] = useState(false)
  const [resolving, setResolving] = useState(false)

  async function ensurePermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      modal.error(
        'Precisamos da sua localização pra usar essa função. Você pode ativar em Ajustes.',
      )
      return false
    }
    return true
  }

  const capture = async (): Promise<CapturedAddress | null> => {
    if (capturing) return null
    setCapturing(true)
    try {
      if (!(await ensurePermission())) return null

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      const results = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      })
      const r = results[0]
      if (!r) {
        modal.error(
          'Não conseguimos identificar o endereço a partir da sua localização. Preencha manualmente.',
        )
        return null
      }

      return {
        street: buildStreet(r.street, r.streetNumber, r.district),
        city: r.city ?? r.subregion ?? '',
        state: normalizeStateAbbr(r.region),
        zipCode: r.postalCode ? maskCEP(r.postalCode) : '',
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      }
    } catch (e) {
      modal.error(extractErrorMessage(e))
      return null
    } finally {
      setCapturing(false)
    }
  }

  const resolveCoords = async (
    input: ResolveCoordsInput,
  ): Promise<{ lat: number; lng: number } | null> => {
    if (resolving) return null
    setResolving(true)
    try {
      if (!(await ensurePermission())) return null

      // Try A2 first — geocode the typed address.
      const query = [input.street, input.city, input.state, input.zipCode]
        .filter(Boolean)
        .join(', ')
      try {
        const results = await Location.geocodeAsync(query)
        const first = results[0]
        if (first) {
          return { lat: first.latitude, lng: first.longitude }
        }
      } catch {
        // fall through to A1
      }

      // A1 fallback — current device position.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      }
    } catch (e) {
      modal.error(extractErrorMessage(e))
      return null
    } finally {
      setResolving(false)
    }
  }

  return {
    capture,
    resolveCoords,
    capturing,
    resolving,
  }
}
