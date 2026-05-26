import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios'

import { clearToken, getToken } from '../secure-store'
import type { ApiErrorBody } from './types'

const baseURL = process.env.EXPO_PUBLIC_API_URL

if (!baseURL) {
  console.warn(
    '[api] EXPO_PUBLIC_API_URL is not set. Requests will fail until it is configured in .env.',
  )
}

// eslint-disable-next-line import/no-named-as-default-member
export const api = axios.create({
  baseURL,
  timeout: 15000,
})

// Request interceptor: inject Bearer token if available.
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

// Response interceptor: normalize errors and handle 401 globally.
let onUnauthorized: (() => void) | null = null

export function registerUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    if (error.response?.status === 401) {
      await clearToken()
      onUnauthorized?.()
    }
    return Promise.reject(error)
  },
)

/**
 * Extracts a user-friendly Portuguese error message from a thrown axios error.
 * Falls back to a generic message if none is present.
 */
export function extractErrorMessage(error: unknown): string {
  // eslint-disable-next-line import/no-named-as-default-member
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const fromBody = error.response?.data?.message
    if (fromBody) return fromBody
    if (error.code === 'ECONNABORTED') {
      return 'A requisição demorou demais. Tente novamente.'
    }
    if (!error.response) {
      return 'Sem conexão com o servidor. Verifique sua internet.'
    }
  }
  return 'Algo deu errado. Tente novamente.'
}
