import { create } from 'zustand'

export type ModalVariant = 'error' | 'success' | 'info'

export interface ModalParams {
  variant?: ModalVariant
  title?: string
  message: string
  okLabel?: string
  onOk?: () => void
}

interface ModalState {
  open: boolean
  variant: ModalVariant
  title?: string
  message: string
  okLabel: string
  onOk?: () => void
  show: (params: ModalParams) => void
  hide: () => void
}

export const useModalStore = create<ModalState>((set) => ({
  open: false,
  variant: 'error',
  title: undefined,
  message: '',
  okLabel: 'OK',
  onOk: undefined,
  show: ({ variant = 'error', title, message, okLabel = 'OK', onOk }) =>
    set({ open: true, variant, title, message, okLabel, onOk }),
  hide: () => set({ open: false }),
}))
