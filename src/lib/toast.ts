import { useToastStore } from '@/store/toast-store'

/**
 * Imperative API for the global toast banner. Non-blocking notifications that
 * auto-dismiss — use for routine success/info feedback ("Cartão adicionado").
 * For blocking errors that need acknowledgement, use `modal.error()`.
 * For confirm/destroy flows, use `modal.confirm()`.
 */
export const toast = {
  success: (message: string) =>
    useToastStore.getState().show(message, 'success'),

  info: (message: string) => useToastStore.getState().show(message, 'info'),

  error: (message: string) => useToastStore.getState().show(message, 'error'),

  hide: () => useToastStore.getState().hide(),
}
