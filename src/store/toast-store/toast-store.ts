import { create } from 'zustand'

export type ToastVariant = 'success' | 'info' | 'error'

interface ToastState {
  open: boolean
  variant: ToastVariant
  message: string
  /** Open count, used as a key so re-triggering the same message restarts the animation. */
  showId: number
  show: (message: string, variant?: ToastVariant) => void
  hide: () => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  open: false,
  variant: 'success',
  message: '',
  showId: 0,
  show: (message, variant = 'success') =>
    set({
      open: true,
      message,
      variant,
      showId: get().showId + 1,
    }),
  hide: () => set({ open: false }),
}))
