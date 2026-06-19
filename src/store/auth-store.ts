import { jwtDecode } from 'jwt-decode'
import { create } from 'zustand'

import { clearToken, saveToken } from '@/lib/secure-store'
import type { TSessionPayload } from '@/apis/auth/auth-api-types'

interface AuthState {
  token: string | null
  session: TSessionPayload | null
  hydrated: boolean

  setSession: (token: string) => Promise<void>
  clearSession: () => Promise<void>
  hydrate: (token: string | null) => void
}

function decodeOrNull(token: string | null): TSessionPayload | null {
  if (!token) return null
  try {
    return jwtDecode<TSessionPayload>(token)
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  session: null,
  hydrated: false,

  setSession: async (token) => {
    await saveToken(token)
    set({ token, session: decodeOrNull(token), hydrated: true })
  },

  clearSession: async () => {
    await clearToken()
    set({ token: null, session: null })
  },

  hydrate: (token) => {
    set({ token, session: decodeOrNull(token), hydrated: true })
  },
}))
