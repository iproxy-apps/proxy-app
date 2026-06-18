import { create } from 'zustand'

export type ModalVariant = 'error' | 'success' | 'info'

export interface ModalParams {
  variant?: ModalVariant
  title?: string
  message: string
  okLabel?: string
  onOk?: () => void
  cancelLabel?: string
  onCancel?: () => void
  destructive?: boolean
}

interface ModalState {
  open: boolean
  variant: ModalVariant
  title?: string
  message: string
  okLabel: string
  onOk?: () => void
  cancelLabel?: string
  onCancel?: () => void
  destructive: boolean
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
  cancelLabel: undefined,
  onCancel: undefined,
  destructive: false,
  show: ({
    variant = 'error',
    title,
    message,
    okLabel = 'OK',
    onOk,
    cancelLabel,
    onCancel,
    destructive = false,
  }) =>
    set({
      open: true,
      variant,
      title,
      message,
      okLabel,
      onOk,
      cancelLabel,
      onCancel,
      destructive,
    }),
  hide: () => set({ open: false }),
}))
