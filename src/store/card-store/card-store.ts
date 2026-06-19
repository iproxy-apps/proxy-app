import { isAxiosError } from 'axios'
import { create } from 'zustand'

import { apis } from '@/apis/apis'
import type { TCard } from '@/apis/cards/cards-api-types'

interface CardState {
  card: TCard | null
  loading: boolean
  loaded: boolean
  /** Fetches once. Subsequent calls are no-ops while loaded. */
  load: () => Promise<void>
  /** Force a refetch (use after add/remove mutations). */
  reload: () => Promise<void>
  /** Set the card directly without hitting the network (e.g., after a delete). */
  setCard: (card: TCard | null) => void
  /** Clear state — call from signOut. */
  reset: () => void
}

export const useCardStore = create<CardState>((set, get) => ({
  card: null,
  loading: false,
  loaded: false,

  load: async () => {
    const { loaded, loading } = get()
    if (loaded || loading) return
    await get().reload()
  },

  reload: async () => {
    set({ loading: true })
    try {
      const data = await apis.cards.fetch()
      set({ card: data, loaded: true, loading: false })
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 404) {
        set({ card: null, loaded: true, loading: false })
        return
      }
      // Real error — keep loaded: false so the next mount can retry.
      set({ loading: false })
      console.warn('[card-store] fetch failed', e)
    }
  },

  setCard: (card) => set({ card, loaded: true }),

  reset: () => set({ card: null, loading: false, loaded: false }),
}))
