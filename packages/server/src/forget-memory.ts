import type { AccountForgetting } from './store.js'
import type { MemoryAuthStore } from './auth.js'
import type { MemoryProjectStore } from './projects.js'
import type { AiKeyVault } from './ai-keys.js'
import type { AccountPlanStore } from './account-plans.js'

// The memory stores' share of an account that deleted itself (#1280), for the log store's erasure
// to call: what Postgres does in its one transaction, done here store by store, since nothing in
// memory can be read half written.
export function memoryForgetting(stores: { auth?: MemoryAuthStore | null; projects?: MemoryProjectStore | null; vault?: AiKeyVault | null; plans?: AccountPlanStore | null }): AccountForgetting {
  return {
    forget: async (account) => {
      const email = (await stores.auth?.accountById(account))?.email ?? ''
      stores.projects?.forgetAccount(account, email)
      await stores.vault?.remove(account)
      await stores.plans?.clearPlan(account)
      return stores.auth?.forget(account) ?? false
    },
  }
}
