import { authApis } from './auth/auth-apis'
import { cardsApis } from './cards/cards-apis'

/**
 * Typed route map. Each entry corresponds to one backend module.
 * Grouped to mirror the backend layout (auth, cards, tasks, ...).
 *
 * Usage:
 *   import { apis } from '@/apis/apis'
 *   await apis.auth.session({ email, password })
 *   await apis.cards.fetch()
 */
export const apis = {
  auth: authApis,
  cards: cardsApis,
}
