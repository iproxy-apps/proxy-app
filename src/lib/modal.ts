import { useModalStore, type ModalParams } from '../store/modal-store'

/**
 * Imperative API for the global app modal. Can be called from anywhere —
 * inside React components, hooks, or even non-React code (e.g., interceptors).
 *
 * Usage:
 *   modal.error('Email já está em uso.')
 *   modal.success('Conta criada!', 'Bem-vindo')
 *   modal.show({ variant: 'info', title: '...', message: '...', onOk: () => ... })
 */
export const modal = {
  error: (message: string, title?: string) =>
    useModalStore.getState().show({ variant: 'error', title, message }),

  success: (message: string, title?: string) =>
    useModalStore.getState().show({ variant: 'success', title, message }),

  info: (message: string, title?: string) =>
    useModalStore.getState().show({ variant: 'info', title, message }),

  show: (params: ModalParams) => useModalStore.getState().show(params),

  hide: () => useModalStore.getState().hide(),
}
